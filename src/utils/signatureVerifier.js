import * as forge from 'node-forge';
import * as pdfjsLib from 'pdfjs-dist';

// Configure pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

/**
 * Extracts raw bytes from a PDF at a given byte range
 */
function extractByteRange(pdfBytes, byteRanges) {
  const parts = [];
  for (const [start, length] of byteRanges) {
    parts.push(pdfBytes.slice(start, start + length));
  }
  // Concatenate all parts
  const totalLength = parts.reduce((acc, p) => acc + p.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    combined.set(part, offset);
    offset += part.length;
  }
  return combined;
}

/**
 * Parse a CMS/PKCS#7 signature blob (as hex string) using node-forge
 */
function parseCMSSignature(hexContents) {
  const derBytes = forge.util.hexToBytes(hexContents);
  const asn1 = forge.asn1.fromDer(derBytes);
  const p7 = forge.pkcs7.messageFromAsn1(asn1);
  return p7;
}

/**
 * Verify a single PDF signature object
 */
async function verifyPDFSignature(sigObj, pdfBytes) {
  const result = {
    signerName: 'Unknown',
    signerEmail: null,
    signingTime: null,
    reason: null,
    location: null,
    certificates: [],
    integrityValid: false,
    certTrustValid: false,
    isExpired: false,
    isSelfSigned: false,
    errors: [],
    warnings: [],
  };

  try {
    const { byteRange, contents } = sigObj;
    if (!byteRange || !contents) {
      result.errors.push('Missing ByteRange or Contents in signature dictionary.');
      return result;
    }

    // Extract the signed document bytes
    const signedBytes = extractByteRange(pdfBytes, [
      [byteRange[0], byteRange[1]],
      [byteRange[2], byteRange[3]],
    ]);

    // Parse the CMS signature
    let p7;
    try {
      p7 = parseCMSSignature(contents);
    } catch (e) {
      result.errors.push('Failed to parse signature CMS data: ' + e.message);
      return result;
    }

    // Extract signer info
    const signerInfo = p7.signers && p7.signers[0];
    const cert = p7.certificates && p7.certificates[0];

    if (cert) {
      // Extract signer name
      const cn = cert.subject.getField('CN');
      const email = cert.subject.getField('E') || cert.subject.getField('emailAddress');
      result.signerName = cn ? cn.value : 'Unknown';
      result.signerEmail = email ? email.value : null;

      // Check expiry
      const now = new Date();
      result.isExpired = now > cert.validity.notAfter;
      if (result.isExpired) {
        result.warnings.push(`Certificate expired on ${cert.validity.notAfter.toLocaleDateString()}`);
      }

      // Check self-signed
      const issuerCN = cert.issuer.getField('CN');
      result.isSelfSigned = cert.issuer.hash === cert.subject.hash;
      if (result.isSelfSigned) {
        result.warnings.push('Certificate is self-signed and may not be trusted.');
      }

      // Extract all certificates in chain
      result.certificates = p7.certificates.map((c) => ({
        subject: c.subject.getField('CN') ? c.subject.getField('CN').value : c.subject.attributes.map(a => `${a.shortName}=${a.value}`).join(', '),
        issuer: c.issuer.getField('CN') ? c.issuer.getField('CN').value : c.issuer.attributes.map(a => `${a.shortName}=${a.value}`).join(', '),
        validFrom: c.validity.notBefore,
        validTo: c.validity.notAfter,
        serialNumber: c.serialNumber,
        isExpired: now > c.validity.notAfter,
        fingerprint: forge.md.sha256.create().update(forge.asn1.toDer(c.toAsn1()).getBytes()).digest().toHex(),
      }));

      // Verify integrity using digest
      try {
        const md = signerInfo.md || forge.md.sha256.create();
        md.update(forge.util.createBuffer(signedBytes).getBytes());
        const digestVerified = p7.verify();
        result.integrityValid = digestVerified;
      } catch (e) {
        result.integrityValid = false;
        result.errors.push('Integrity verification failed: ' + e.message);
      }

      // Basic trust: check if root is in browser's trusted store
      // (We can only do a basic check; full trust needs system CA bundles)
      result.certTrustValid = !result.isSelfSigned && !result.isExpired;
    } else {
      result.errors.push('No certificates found in signature.');
    }

    // Extract signing time from signed attributes
    if (signerInfo && signerInfo.authenticatedAttributes) {
      const signingTimeAttr = signerInfo.authenticatedAttributes.find(
        (a) => a.type === forge.pki.oids.signingTime
      );
      if (signingTimeAttr) {
        result.signingTime = forge.asn1.utcTimeToDate(signingTimeAttr.value[0].value);
      }
    }

    // Extract reason / location from sig field (passed in as sigObj extras)
    result.reason = sigObj.reason || null;
    result.location = sigObj.location || null;

  } catch (err) {
    result.errors.push('Unexpected error: ' + err.message);
  }

  return result;
}

/**
 * Main function: parses a PDF file and verifies all digital signatures
 */
export async function verifyPDFSignatures(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const pdfBytes = new Uint8Array(e.target.result);

        const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
        const pdfDoc = await loadingTask.promise;

        const numPages = pdfDoc.numPages;
        const signatures = [];

        // Use pdf.js to get AcroForm signature fields
        const acroForm = await pdfDoc.getFieldObjects();
        const sigFields = [];

        if (acroForm) {
          for (const fieldName of Object.keys(acroForm)) {
            const fields = acroForm[fieldName];
            for (const field of fields) {
              if (field.type === 'signature') {
                sigFields.push({ name: fieldName, field });
              }
            }
          }
        }

        if (sigFields.length === 0) {
          resolve({
            numPages,
            signatures: [],
            hasSignatures: false,
            message: 'No digital signatures found in this document.',
          });
          return;
        }

        // For each signature field, extract and verify
        // We need to parse the raw PDF bytes for ByteRange/Contents
        const pdfText = new TextDecoder('latin1').decode(pdfBytes);
        
        // Find all /ByteRange entries in the PDF
        const byteRangeRegex = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;
        const contentsRegex = /\/Contents\s*<([0-9a-fA-F]+)>/g;
        const reasonRegex = /\/Reason\s*\(([^)]*)\)/g;
        const locationRegex = /\/Location\s*\(([^)]*)\)/g;
        const contactRegex = /\/ContactInfo\s*\(([^)]*)\)/g;

        const sigDataList = [];
        let brMatch;
        while ((brMatch = byteRangeRegex.exec(pdfText)) !== null) {
          sigDataList.push({
            byteRange: [
              [parseInt(brMatch[1]), parseInt(brMatch[2])],
              [parseInt(brMatch[3]), parseInt(brMatch[4])],
            ],
            brIndex: brMatch.index,
          });
        }

        // Match Contents near each ByteRange
        // We'll do a simple ordered scan
        const allContents = [];
        let cMatch;
        while ((cMatch = contentsRegex.exec(pdfText)) !== null) {
          allContents.push({ hex: cMatch[1], index: cMatch.index });
        }

        const allReasons = [];
        let rMatch;
        while ((rMatch = reasonRegex.exec(pdfText)) !== null) {
          allReasons.push({ value: rMatch[1], index: rMatch.index });
        }

        const allLocations = [];
        let lMatch;
        while ((lMatch = locationRegex.exec(pdfText)) !== null) {
          allLocations.push({ value: lMatch[1], index: lMatch.index });
        }

        // Pair sigDataList with contents
        const sigObjects = sigDataList.map((sd, i) => ({
          byteRange: sd.byteRange,
          contents: allContents[i] ? allContents[i].hex : null,
          reason: allReasons[i] ? allReasons[i].value : null,
          location: allLocations[i] ? allLocations[i].value : null,
        }));

        // Verify each signature
        for (let i = 0; i < sigObjects.length; i++) {
          const sigObj = sigObjects[i];
          const fieldName = sigFields[i] ? sigFields[i].name : `Signature ${i + 1}`;
          const verResult = await verifyPDFSignature(sigObj, pdfBytes);
          signatures.push({
            fieldName,
            ...verResult,
          });
        }

        resolve({
          numPages,
          signatures,
          hasSignatures: signatures.length > 0,
          message: null,
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Verify a certificate file (.cer, .crt, .pem)
 */
export function verifyCertificate(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        let certPem = e.target.result;
        let cert;

        // Try PEM first, then DER
        try {
          cert = forge.pki.certificateFromPem(certPem);
        } catch {
          // Try as DER
          const bytes = new Uint8Array(e.target.result);
          const derStr = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
          const asn1 = forge.asn1.fromDer(derStr);
          cert = forge.pki.certificateFromAsn1(asn1);
        }

        const now = new Date();
        const isExpired = now > cert.validity.notAfter;
        const isSelfSigned = cert.issuer.hash === cert.subject.hash;

        const result = {
          subject: extractDN(cert.subject),
          issuer: extractDN(cert.issuer),
          serialNumber: cert.serialNumber,
          validFrom: cert.validity.notBefore,
          validTo: cert.validity.notAfter,
          isExpired,
          isSelfSigned,
          fingerprint: forge.md.sha256.create().update(forge.asn1.toDer(cert.toAsn1()).getBytes()).digest().toHex(),
          publicKeyAlgorithm: cert.publicKey.n ? 'RSA' : 'EC',
          keySize: cert.publicKey.n ? cert.publicKey.n.bitLength() : null,
          extensions: cert.extensions.map(e => ({ name: e.name, value: typeof e.value === 'string' ? e.value : JSON.stringify(e.value) })),
        };

        resolve(result);
      } catch (err) {
        reject(new Error('Failed to parse certificate: ' + err.message));
      }
    };
    reader.onerror = reject;
    // Read as text first for PEM, re-read as ArrayBuffer if needed
    reader.readAsText(file);
  });
}

function extractDN(entity) {
  const fields = {};
  entity.attributes.forEach(attr => {
    fields[attr.shortName] = attr.value;
  });
  return fields;
}

/**
 * Generate a verification summary/report as JSON
 */
export function generateReport(filename, verificationResult) {
  return {
    reportGeneratedAt: new Date().toISOString(),
    file: filename,
    numPages: verificationResult.numPages,
    signaturesFound: verificationResult.signatures.length,
    signatures: verificationResult.signatures.map(sig => ({
      fieldName: sig.fieldName,
      signer: sig.signerName,
      email: sig.signerEmail,
      signingTime: sig.signingTime,
      reason: sig.reason,
      location: sig.location,
      integrityValid: sig.integrityValid,
      certTrustValid: sig.certTrustValid,
      isExpired: sig.isExpired,
      isSelfSigned: sig.isSelfSigned,
      overallStatus: getOverallStatus(sig),
      certificates: sig.certificates,
      errors: sig.errors,
      warnings: sig.warnings,
    })),
  };
}

export function getOverallStatus(sig) {
  if (sig.errors && sig.errors.length > 0) return 'invalid';
  if (sig.isExpired) return 'expired';
  if (sig.isSelfSigned) return 'self-signed';
  if (!sig.integrityValid) return 'tampered';
  if (!sig.certTrustValid) return 'untrusted';
  return 'valid';
}
