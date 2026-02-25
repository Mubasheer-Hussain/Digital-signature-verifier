# DigiVerify - Digital Signature Verifier

A web application for verifying digital signatures embedded in PDF documents and inspecting X.509 certificates. Built with Vite, React, and node-forge.

---

## Features

### PDF Signature Verification
- Extracts and verifies all embedded digital signatures (PAdES, PKCS#7/CMS)
- Validates document integrity to detect post-signing tampering
- Displays full certificate chain for each signature
- Reports signer identity, signing time, reason, and location
- Flags expired, self-signed, and untrusted certificates

### Certificate Inspector
- Parses and displays X.509 certificate files (.pem, .cer, .crt)
- Shows subject, issuer, serial number, key algorithm, and key size
- Displays validity period and expiration status
- Lists certificate extensions
- Generates SHA-256 fingerprint

### Verification Reports
- Generates structured JSON reports from verification results
- Includes all signature details, certificate chains, and issue flags
- One-click export/download

---

## Tech Stack

| Layer       | Technology                  |
|-------------|-----------------------------|
| Frontend    | React (via Vite)            |
| Crypto      | node-forge                  |
| PDF Parsing | pdfjs-dist                  |
| Icons       | lucide-react                |
| File Upload | react-dropzone              |

---

## Getting Started

### Prerequisites

- Node.js (v18 or later recommended)
- npm

### Installation

```bash
git clone <repository-url>
cd Digitalsign-verifier
npm install
```

### Development

```bash
npm run dev
```

Open http://localhost:5173 in your browser.

### Production Build

```bash
npm run build
```

The output will be in the `dist/` directory.

---

## Usage

1. **Verify a PDF** - Open the PDF Verifier tab and drag a signed PDF into the dropzone. The app will parse the document, extract all signature fields, and display the verification results including signer details, integrity status, and certificate chain.

2. **Inspect a Certificate** - Switch to the Certificate Inspector tab and drop a `.pem`, `.cer`, or `.crt` file. The app will display the full certificate details including subject, issuer, validity, key algorithm, extensions, and fingerprint.

3. **Export a Report** - After verifying a PDF, switch to the Report tab to view the structured JSON report. Click "Export JSON" to download it.

---

## Status Indicators

| Status      | Meaning                                              |
|-------------|------------------------------------------------------|
| Valid       | Signature is cryptographically valid and trusted      |
| Self-Signed | Certificate is not issued by a trusted CA            |
| Expired     | The signing certificate has passed its validity date |
| Untrusted   | Certificate chain could not be fully verified        |
| Tampered    | Document content was modified after signing          |
| Invalid     | Signature verification failed                        |

---

## Project Structure

```
src/
  App.jsx                    # Main application with 3 tabs
  App.css                    # Design system and styling
  main.jsx                   # React entry point
  utils/
    signatureVerifier.js     # Core verification engine
index.html                   # HTML entry point
```

---

## Limitations

- Certificate trust validation is basic (checks self-signed and expiry status). Full system CA bundle verification requires a server-side component.
- OCSP and CRL revocation checking is reported as warnings; real-time OCSP queries require a backend proxy.
- Only PDF digital signatures are supported at this time. XML (XAdES) and binary (CAdES) support may be added in the future.

---

## License

MIT
