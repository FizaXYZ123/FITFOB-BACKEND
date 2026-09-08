import AWS from "aws-sdk";
import { PDFParse } from "pdf-parse";

const awsConfig = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
  region: process.env.AWS_REGION || "ap-south-1",
};

const textract = new AWS.Textract(awsConfig);

const rekognition = new AWS.Rekognition(awsConfig);

export type OwnerDocumentType =
  | "aadhaar"
  | "pan"
  | "voter-id"
  | "driving-license"
  | "passport"
  | "gst"
  | "bank-statement-or-cheque"
  | "udyam-msme"
  | "unknown";

export interface OwnerDocumentValidationResult {
  valid: boolean;
  documentType: OwnerDocumentType;
  displayName: string;
}

interface DocumentQuery {
  Text: string;
  Alias: string;
}

interface DocumentConfig {
  displayName: string;
  requiresFace: boolean;
  requiresQr: boolean;
  requiresMrz: boolean;
  validateExpiry: boolean;
  requiredFields: string[];
  queries: DocumentQuery[];
}

/*
|--------------------------------------------------------------------------
| Minimum confidence
|--------------------------------------------------------------------------
|
| Textract returns a confidence score for QUERY_RESULT blocks.
|
| You can increase this later if required.
|
*/

const MIN_TEXTRACT_CONFIDENCE = 85;

/*
|--------------------------------------------------------------------------
| Document configuration
|--------------------------------------------------------------------------
*/

const DOCUMENT_CONFIG: Record<
  Exclude<OwnerDocumentType, "unknown">,
  DocumentConfig
> = {
  pan: {
    displayName: "PAN Card",

    requiresFace: true,
    requiresQr: false,
    requiresMrz: false,
    validateExpiry: false,

    requiredFields: [
      "PAN_NUMBER",
      "NAME",
      "DOB",
    ],

    queries: [
      {
        Text: "What is the PAN number?",
        Alias: "PAN_NUMBER",
      },
      {
        Text: "What is the name of the PAN card holder?",
        Alias: "NAME",
      },
      {
        Text: "What is the date of birth?",
        Alias: "DOB",
      },
      {
        Text: "What is the father's name?",
        Alias: "FATHER_NAME",
      },
    ],
  },

  aadhaar: {
    displayName: "Aadhaar Card",

    requiresFace: true,
    requiresQr: true,
    requiresMrz: false,
    validateExpiry: false,

    requiredFields: [
      "AADHAAR_NUMBER",
      "NAME",
      "DOB",
    ],

    queries: [
      {
        Text: "What is the Aadhaar number?",
        Alias: "AADHAAR_NUMBER",
      },
      {
        Text: "What is the name of the Aadhaar holder?",
        Alias: "NAME",
      },
      {
        Text: "What is the date of birth or year of birth?",
        Alias: "DOB",
      },
      {
        Text: "What is the gender?",
        Alias: "GENDER",
      },
      {
        Text: "What is the address?",
        Alias: "ADDRESS",
      },
    ],
  },

  "voter-id": {
    displayName: "Voter ID Card",

    requiresFace: true,
    requiresQr: false,
    requiresMrz: false,
    validateExpiry: false,

    requiredFields: [
      "EPIC_NUMBER",
      "NAME",
    ],

    queries: [
      {
        Text: "What is the EPIC number or voter ID number?",
        Alias: "EPIC_NUMBER",
      },
      {
        Text: "What is the name of the voter?",
        Alias: "NAME",
      },
      {
        Text: "What is the date of birth or age?",
        Alias: "DOB_OR_AGE",
      },
      {
        Text: "What is the father's or husband's name?",
        Alias: "RELATION_NAME",
      },
      {
        Text: "What is the address?",
        Alias: "ADDRESS",
      },
    ],
  },

  "driving-license": {
    displayName: "Driving License",

    requiresFace: true,
    requiresQr: false,
    requiresMrz: false,
    validateExpiry: true,

    requiredFields: [
      "DL_NUMBER",
      "NAME",
      "DOB",
    ],

    queries: [
      {
        Text: "What is the driving licence number?",
        Alias: "DL_NUMBER",
      },
      {
        Text: "What is the name of the licence holder?",
        Alias: "NAME",
      },
      {
        Text: "What is the date of birth?",
        Alias: "DOB",
      },
      {
        Text: "What is the issue date?",
        Alias: "ISSUE_DATE",
      },
      {
        Text: "What is the expiry date?",
        Alias: "EXPIRY_DATE",
      },
      {
        Text: "What is the address?",
        Alias: "ADDRESS",
      },
    ],
  },

  passport: {
    displayName: "Passport",

    requiresFace: true,
    requiresQr: false,
    requiresMrz: true,
    validateExpiry: true,

    requiredFields: [
      "PASSPORT_NUMBER",
      "NAME",
      "DOB",
      "NATIONALITY",
    ],

    queries: [
      {
        Text: "What is the passport number?",
        Alias: "PASSPORT_NUMBER",
      },
      {
        Text: "What is the name of the passport holder?",
        Alias: "NAME",
      },
      {
        Text: "What is the date of birth?",
        Alias: "DOB",
      },
      {
        Text: "What is the nationality?",
        Alias: "NATIONALITY",
      },
      {
        Text: "What is the sex?",
        Alias: "SEX",
      },
      {
        Text: "What is the date of issue?",
        Alias: "ISSUE_DATE",
      },
      {
        Text: "What is the date of expiry?",
        Alias: "EXPIRY_DATE",
      },
    ],
  },

  gst: {
    displayName: "GST Registration Certificate",

    requiresFace: false,
    requiresQr: true,
    requiresMrz: false,
    validateExpiry: false,

    requiredFields: [
      "GSTIN",
      "LEGAL_NAME",
    ],

    queries: [
      {
        Text: "What is the GSTIN or Goods and Services Tax Identification Number?",
        Alias: "GSTIN",
      },
      {
        Text: "What is the legal name of the business?",
        Alias: "LEGAL_NAME",
      },
      {
        Text: "What is the trade name?",
        Alias: "TRADE_NAME",
      },
      {
        Text: "What is the constitution of business?",
        Alias: "BUSINESS_CONSTITUTION",
      },
      {
        Text: "What is the principal place of business?",
        Alias: "ADDRESS",
      },
      {
        Text: "What is the date of issue of the certificate?",
        Alias: "ISSUE_DATE",
      },
    ],
  },

  "udyam-msme": {
    displayName: "Udyam / MSME Certificate",

    requiresFace: false,
    requiresQr: true,
    requiresMrz: false,
    validateExpiry: false,

    requiredFields: [
      "UDYAM_NUMBER",
      "ENTERPRISE_NAME",
    ],

    queries: [
      {
        Text: "What is the Udyam registration number?",
        Alias: "UDYAM_NUMBER",
      },
      {
        Text: "What is the name of the enterprise?",
        Alias: "ENTERPRISE_NAME",
      },
      {
        Text: "What is the organisation type?",
        Alias: "ORGANISATION_TYPE",
      },
      {
        Text: "What is the major activity of the enterprise?",
        Alias: "MAJOR_ACTIVITY",
      },
      {
        Text: "What is the address?",
        Alias: "ADDRESS",
      },
      {
        Text: "What is the date of registration?",
        Alias: "REGISTRATION_DATE",
      },
    ],
  },

  "bank-statement-or-cheque": {
    displayName: "Bank Statement / Cheque",

    requiresFace: false,
    requiresQr: false,
    requiresMrz: false,
    validateExpiry: false,

    requiredFields: [
      "BANK_NAME",
      "ACCOUNT_HOLDER",
      "ACCOUNT_NUMBER",
    ],

    queries: [
      {
        Text: "What is the bank name?",
        Alias: "BANK_NAME",
      },
      {
        Text: "What is the account holder name?",
        Alias: "ACCOUNT_HOLDER",
      },
      {
        Text: "What is the account number?",
        Alias: "ACCOUNT_NUMBER",
      },
      {
        Text: "What is the IFSC code?",
        Alias: "IFSC",
      },
      {
        Text: "What is the branch name?",
        Alias: "BRANCH",
      },
    ],
  },
};

/*
|--------------------------------------------------------------------------
| Detect document type
|--------------------------------------------------------------------------
|
| IMPORTANT:
| This only identifies the likely document.
| It does NOT approve the document.
|
*/

function detectDocumentType(text: string): OwnerDocumentType {
  const t = text.toLowerCase();

  // GST
  if (
    t.includes("gstin") ||
    t.includes("goods and services tax") ||
    t.includes("form gst reg") ||
    t.includes("gst registration") ||
    (
      t.includes("registration certificate") &&
      (t.includes("gst") || t.includes("taxpayer"))
    ) ||
    t.includes("central board of indirect taxes")
  ) {
    return "gst";
  }

  // Udyam / MSME
  if (
    t.includes("udyam") ||
    t.includes("msme") ||
    t.includes("ministry of micro") ||
    t.includes("small and medium enterprises") ||
    t.includes("micro, small & medium") ||
    t.includes("udyam registration")
  ) {
    return "udyam-msme";
  }

  // Bank
  if (
    t.includes("cancelled cheque") ||
    t.includes("cancelled check") ||
    t.includes("bank statement") ||
    t.includes("statement of account") ||
    t.includes("account statement") ||
    (
      t.includes("ifsc") &&
      (
        t.includes("account") ||
        t.includes("branch") ||
        t.includes("bank")
      )
    ) ||
    t.includes("account number") ||
    t.includes("account no")
  ) {
    return "bank-statement-or-cheque";
  }

  // Aadhaar
  if (
    t.includes("aadhaar") ||
    t.includes("uidai") ||
    t.includes("unique identification authority")
  ) {
    return "aadhaar";
  }

  // PAN
  if (
    t.includes("income tax department") ||
    t.includes("permanent account number") ||
    (t.includes("income tax") && t.includes("pan"))
  ) {
    return "pan";
  }

  // Voter ID
  if (
    t.includes("election commission") ||
    t.includes("electoral photo identity card") ||
    t.includes("epic no") ||
    t.includes("epic number") ||
    t.includes("voter")
  ) {
    return "voter-id";
  }

  // Driving License
  if (
    t.includes("driving licence") ||
    t.includes("driving license") ||
    t.includes("licence to drive") ||
    t.includes("motor vehicles") ||
    t.includes("transport department")
  ) {
    return "driving-license";
  }

  // Passport
  if (
    t.includes("passport") ||
    t.includes("republic of india")
  ) {
    return "passport";
  }

  return "unknown";
}

/*
|--------------------------------------------------------------------------
| Get OCR text from Textract
|--------------------------------------------------------------------------
*/

function getTextractText(
  blocks: AWS.Textract.Block[] | undefined,
): string {
  return (
    blocks
      ?.filter((block) => block.BlockType === "LINE")
      .map((block) => block.Text)
      .filter(Boolean)
      .join(" ") || ""
  );
}

/*
|--------------------------------------------------------------------------
| Extract query results
|--------------------------------------------------------------------------
*/

interface QueryResult {
  text: string;
  confidence: number;
}

function extractQueryResults(
  blocks: AWS.Textract.Block[] | undefined,
): Record<string, QueryResult> {
  const results: Record<string, QueryResult> = {};

  for (const block of blocks || []) {
    if (
      block.BlockType === "QUERY_RESULT" &&
      block.Query?.Alias
    ) {
      const text = block.Text?.trim() || "";

      results[block.Query.Alias] = {
        text,
        confidence: block.Confidence || 0,
      };
    }
  }

  return results;
}

/*
|--------------------------------------------------------------------------
| Validate required Textract fields
|--------------------------------------------------------------------------
*/

function validateRequiredFields(
  documentType: Exclude<OwnerDocumentType, "unknown">,
  queryResults: Record<string, QueryResult>,
): boolean {
  const config = DOCUMENT_CONFIG[documentType];

  return config.requiredFields.every((field) => {
    const result = queryResults[field];

    if (!result) {
      return false;
    }

    if (!result.text || result.text.trim().length === 0) {
      return false;
    }

    if (result.confidence < MIN_TEXTRACT_CONFIDENCE) {
      return false;
    }

    return true;
  });
}

/*
|--------------------------------------------------------------------------
| Validate document number formats
|--------------------------------------------------------------------------
*/

function validateDocumentNumber(
  documentType: Exclude<OwnerDocumentType, "unknown">,
  queryResults: Record<string, QueryResult>,
): boolean {
  const getValue = (alias: string) =>
    queryResults[alias]?.text
      ?.replace(/\s/g, "")
      .toUpperCase();

  switch (documentType) {
    case "pan": {
      const pan = getValue("PAN_NUMBER");

      return !!pan && /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan);
    }

    case "gst": {
      const gstin = getValue("GSTIN");

      if (!gstin) {
        return false;
      }

      // Basic GSTIN structure.
      // Final authenticity should still be checked against the GST system.
      return /^[0-9]{2}[A-Z0-9]{13}$/.test(gstin);
    }

    case "aadhaar": {
      const aadhaar = getValue("AADHAAR_NUMBER");

      if (!aadhaar) {
        return false;
      }

      // Accept 12-digit Aadhaar or a masked representation.
      return (
        /^[0-9]{12}$/.test(aadhaar) ||
        /^[X*]{4,8}[0-9]{4}$/.test(aadhaar)
      );
    }

    case "voter-id": {
      const epic = getValue("EPIC_NUMBER");

      return !!epic && /^[A-Z0-9-]{6,20}$/.test(epic);
    }

    case "driving-license": {
      const dl = getValue("DL_NUMBER");

      return !!dl && /^[A-Z0-9-]{5,30}$/.test(dl);
    }

    case "passport": {
      const passport = getValue("PASSPORT_NUMBER");

      return !!passport && /^[A-Z][0-9]{7}$/.test(passport);
    }

    case "udyam-msme": {
      const udyam = getValue("UDYAM_NUMBER");

      return (
        !!udyam &&
        /^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$/.test(udyam)
      );
    }

    case "bank-statement-or-cheque": {
      const account = getValue("ACCOUNT_NUMBER");

      return !!account && /^[0-9A-Z-]{6,30}$/.test(account);
    }

    default:
      return true;
  }
}

/*
|--------------------------------------------------------------------------
| Detect human face
|--------------------------------------------------------------------------
|
| Rekognition accepts JPEG/PNG images.
|
*/

async function hasHumanFace(buffer: Buffer): Promise<boolean> {
  try {
    const response = await rekognition
      .detectFaces({
        Image: {
          Bytes: buffer,
        },
        Attributes: ["DEFAULT"],
      })
      .promise();

    const faces = response.FaceDetails || [];

    return faces.some(
      (face) => (face.Confidence || 0) >= 90,
    );
  } catch (error) {
    console.error(
      "Rekognition face detection failed:",
      error,
    );

    return false;
  }
}

/*
|--------------------------------------------------------------------------
| Analyze image with Textract
|--------------------------------------------------------------------------
*/

async function analyzeImage(
  buffer: Buffer,
): Promise<{
  documentType: OwnerDocumentType;
  text: string;
  queryResults: Record<string, QueryResult>;
}> {
  /*
   * First pass:
   * Identify the likely document type.
   */

  const detectResponse = await textract
    .detectDocumentText({
      Document: {
        Bytes: buffer,
      },
    })
    .promise();

  const text = getTextractText(detectResponse.Blocks);

  const documentType = detectDocumentType(text);

  if (documentType === "unknown") {
    return {
      documentType,
      text,
      queryResults: {},
    };
  }

  const config = DOCUMENT_CONFIG[documentType];

  /*
   * Second pass:
   * Ask Textract document-specific questions.
   */

  const analyzeResponse = await textract
    .analyzeDocument({
      Document: {
        Bytes: buffer,
      },

      FeatureTypes: [
        "QUERIES",
        "FORMS",
        "LAYOUT",
      ],

      QueriesConfig: {
        Queries: config.queries,
      },
    })
    .promise();

  return {
    documentType,
    text: getTextractText(analyzeResponse.Blocks) || text,
    queryResults: extractQueryResults(
      analyzeResponse.Blocks,
    ),
  };
}

/*
|--------------------------------------------------------------------------
| Final validation
|--------------------------------------------------------------------------
*/

async function validateImageDocument(
  buffer: Buffer,
): Promise<OwnerDocumentValidationResult> {
  const analysis = await analyzeImage(buffer);

  if (analysis.documentType === "unknown") {
    return {
      valid: false,
      documentType: "unknown",
      displayName: "Unknown Document",
    };
  }

  const documentType = analysis.documentType;

  const config = DOCUMENT_CONFIG[documentType];

  /*
   * 1. Required fields
   */

  const fieldsValid = validateRequiredFields(
    documentType,
    analysis.queryResults,
  );

  if (!fieldsValid) {
    return {
      valid: false,
      documentType,
      displayName: `${config.displayName} - Required details are missing`,
    };
  }

  /*
   * 2. Document number
   */

  const documentNumberValid = validateDocumentNumber(
    documentType,
    analysis.queryResults,
  );

  if (!documentNumberValid) {
    return {
      valid: false,
      documentType,
      displayName: `${config.displayName} - Invalid document number`,
    };
  }

  /*
   * 3. Human photo
   */

  if (config.requiresFace) {
    const faceExists = await hasHumanFace(buffer);

    if (!faceExists) {
      return {
        valid: false,
        documentType,
        displayName: `${config.displayName} - Photo is missing or not visible`,
      };
    }
  }

  /*
   * 4. QR code
   *
   * We intentionally don't mark this true yet.
   *
   * Textract does not cryptographically validate QR codes.
   * This should be connected to a QR decoder + document-specific
   * verification later.
   */

  if (config.requiresQr) {
    console.warn(
      `${documentType} requires QR validation. ` +
      `Connect a QR decoder/official verification step before treating ` +
      `this as an authenticity check.`,
    );
  }

  /*
   * 5. MRZ
   *
   * Passport MRZ parsing should be added separately.
   */

  if (config.requiresMrz) {
    console.warn(
      "Passport MRZ validation should be performed before " +
      "treating the passport as fully verified.",
    );
  }

  /*
   * Everything that this AWS layer can safely validate has passed.
   */

  return {
    valid: true,
    documentType,
    displayName: config.displayName,
  };
}

/*
|--------------------------------------------------------------------------
| Main exported function
|--------------------------------------------------------------------------
*/

export const validateOwnerGovernmentDocument = async (
  buffer: Buffer,
): Promise<OwnerDocumentValidationResult> => {
  const isPdf =
    buffer.subarray(0, 4).toString() === "%PDF";

  /*
   * IMAGE
   */

  if (!isPdf) {
    return validateImageDocument(buffer);
  }

  /*
   * PDF
   *
   * Keep PDF text extraction for now because your existing
   * implementation already supports PDFs.
   *
   * For multi-page PDFs, use asynchronous Textract
   * StartDocumentAnalysis + S3 in the next step.
   */

  try {
    const parser = new PDFParse({
      data: buffer,
    });

    const parsed = await parser.getText();

    const text = parsed?.text || "";

    const documentType = detectDocumentType(text);

    if (documentType === "unknown") {
      return {
        valid: false,
        documentType: "unknown",
        displayName: "Unknown Document",
      };
    }

    const config = DOCUMENT_CONFIG[documentType];

    /*
     * For PDFs, use the extracted text as a first validation layer.
     *
     * This prevents a PDF containing only:
     * "Income Tax Department"
     *
     * from automatically becoming a valid PAN.
     */

    const normalizedText = text
      .replace(/\s+/g, " ")
      .trim();

    /*
     * PAN
     */

    if (documentType === "pan") {
      const panMatch = normalizedText
        .toUpperCase()
        .match(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/);

      if (!panMatch) {
        return {
          valid: false,
          documentType,
          displayName:
            "PAN Card - PAN number is missing or hidden",
        };
      }
    }

    /*
     * GST
     */

    if (documentType === "gst") {
      const gstMatch = normalizedText
        .toUpperCase()
        .match(/\b[0-9]{2}[A-Z0-9]{13}\b/);

      if (!gstMatch) {
        return {
          valid: false,
          documentType,
          displayName:
            "GST Registration Certificate - GSTIN is missing",
        };
      }
    }

    /*
     * Udyam
     */

    if (documentType === "udyam-msme") {
      const udyamMatch = normalizedText
        .toUpperCase()
        .match(
          /\bUDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}\b/,
        );

      if (!udyamMatch) {
        return {
          valid: false,
          documentType,
          displayName:
            "Udyam / MSME Certificate - Udyam number is missing",
        };
      }
    }

    /*
     * Aadhaar
     */

    if (documentType === "aadhaar") {
      const aadhaarMatch = normalizedText.match(
        /\b(?:\d{4}[\s-]?){2}\d{4}\b/,
      );

      const maskedAadhaarMatch = normalizedText.match(
        /\b[Xx*]{4,8}[\s-]?\d{4}\b/,
      );

      if (!aadhaarMatch && !maskedAadhaarMatch) {
        return {
          valid: false,
          documentType,
          displayName:
            "Aadhaar Card - Aadhaar number is missing",
        };
      }
    }

    /*
     * We still need the visual page/image for:
     *
     * - face detection
     * - QR detection
     * - passport MRZ
     *
     * The existing PDFParse image extraction is attempted below.
     */

    try {
      const imageResult = await parser.getImage({
        imageBuffer: true,
      });

      for (const page of imageResult.pages || []) {
        for (const img of page.images || []) {
          if (!img.data || img.data.length === 0) {
            continue;
          }

          const imgBuffer = Buffer.from(img.data);

          /*
           * Photo validation
           */

          if (config.requiresFace) {
            const faceExists =
              await hasHumanFace(imgBuffer);

            if (faceExists) {
              return {
                valid: true,
                documentType,
                displayName: config.displayName,
              };
            }
          }
        }
      }
    } catch (imageError) {
      console.error(
        "PDF image extraction failed:",
        imageError,
      );
    }

    /*
     * If the document requires a face and we couldn't find
     * a visible face, reject it.
     */

    if (config.requiresFace) {
      return {
        valid: false,
        documentType,
        displayName:
          `${config.displayName} - Photo could not be verified`,
      };
    }

    /*
     * Non-photo documents can pass the current PDF text layer
     * validation.
     *
     * QR/official verification still needs to be added.
     */

    return {
      valid: true,
      documentType,
      displayName: config.displayName,
    };
  } catch (pdfError) {
    console.error(
      "PDF parsing error in owner document validator:",
      pdfError,
    );

    throw pdfError;
  }
};