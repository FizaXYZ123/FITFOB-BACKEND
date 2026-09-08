import AWS from "aws-sdk";
import { PDFParse } from "pdf-parse";

const textract = new AWS.Textract({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
  region: process.env.AWS_REGION || "ap-south-1",
});

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

function analyzeExtractedText(text: string): OwnerDocumentValidationResult {
  const t = text.toLowerCase();

  // 1. GST Certificate / GSTIN
  if (
    t.includes("gstin") ||
    t.includes("goods and services tax") ||
    t.includes("form gst reg") ||
    t.includes("gst registration") ||
    (t.includes("registration certificate") && (t.includes("gst") || t.includes("taxpayer"))) ||
    t.includes("central board of indirect taxes")
  ) {
    return {
      valid: true,
      documentType: "gst",
      displayName: "GST Registration Certificate",
    };
  }

  // 2. Udyam / MSME Registration Certificate
  if (
    t.includes("udyam") ||
    t.includes("msme") ||
    t.includes("ministry of micro") ||
    t.includes("small and medium enterprises") ||
    t.includes("micro, small & medium") ||
    t.includes("udyam registration") ||
    t.includes("udyam registration certificate")
  ) {
    return {
      valid: true,
      documentType: "udyam-msme",
      displayName: "Udyam / MSME Certificate",
    };
  }

  // 3. Bank Statement or Cheque
  if (
    t.includes("cheque") ||
    (t.includes("check") && (t.includes("pay") || t.includes("ifsc") || t.includes("bank"))) ||
    t.includes("cancelled cheque") ||
    t.includes("bank statement") ||
    t.includes("statement of account") ||
    t.includes("account statement") ||
    (t.includes("ifsc") && (t.includes("account") || t.includes("branch") || t.includes("bank"))) ||
    (t.includes("savings a/c") || t.includes("current a/c") || t.includes("account no") || t.includes("account number"))
  ) {
    return {
      valid: true,
      documentType: "bank-statement-or-cheque",
      displayName: "Bank Statement / Cheque",
    };
  }

  // 4. Aadhaar Card
  if (
    t.includes("aadhaar") ||
    t.includes("uidai") ||
    t.includes("unique identification") ||
    (t.includes("government of india") && (t.includes("male") || t.includes("female") || t.includes("dob") || t.includes("year of birth")))
  ) {
    return {
      valid: true,
      documentType: "aadhaar",
      displayName: "Aadhaar Card",
    };
  }

  // 5. PAN Card
  if (
    t.includes("income tax department") ||
    t.includes("permanent account number") ||
    (t.includes("govt. of india") && t.includes("father's name")) ||
    (t.includes("income tax") && t.includes("pan"))
  ) {
    return {
      valid: true,
      documentType: "pan",
      displayName: "PAN Card",
    };
  }

  // 6. Voter ID
  if (
    t.includes("election commission") ||
    t.includes("elector") ||
    t.includes("voter") ||
    t.includes("epic no") ||
    t.includes("electoral photo identity card")
  ) {
    return {
      valid: true,
      documentType: "voter-id",
      displayName: "Voter ID Card",
    };
  }

  // 7. Driving License
  if (
    t.includes("driving licence") ||
    t.includes("driving license") ||
    t.includes("licence to drive") ||
    t.includes("motor vehicles") ||
    t.includes("transport department") ||
    (t.includes("transport") && (t.includes("dl no") || t.includes("license")))
  ) {
    return {
      valid: true,
      documentType: "driving-license",
      displayName: "Driving License",
    };
  }

  // 8. Passport
  if (
    t.includes("passport") ||
    (t.includes("republic of india") && (t.includes("type p") || t.includes("passport") || t.includes("nationality")))
  ) {
    return {
      valid: true,
      documentType: "passport",
      displayName: "Passport",
    };
  }

  return {
    valid: false,
    documentType: "unknown",
    displayName: "Unknown Document",
  };
}

export const validateOwnerGovernmentDocument = async (
  buffer: Buffer,
): Promise<OwnerDocumentValidationResult> => {
  const isPdf = buffer.subarray(0, 4).toString() === "%PDF";

  if (isPdf) {
    try {
      const parser = new PDFParse({ data: buffer });
      const parsed = await parser.getText();
      const text = parsed?.text || "";

      if (text.trim().length > 0) {
        const result = analyzeExtractedText(text);
        if (result.valid) {
          return result;
        }
      }

      // If text extraction yielded no match, check if scanned image is embedded
      try {
        const imageResult = await parser.getImage({ imageBuffer: true });
        for (const page of imageResult.pages || []) {
          for (const img of page.images || []) {
            if (img.data && img.data.length > 0) {
              const imgBuffer = Buffer.from(img.data);
              const textractRes = await textract
                .detectDocumentText({
                  Document: {
                    Bytes: imgBuffer,
                  },
                })
                .promise();

              const ocrText = (
                textractRes.Blocks?.filter((b) => b.BlockType === "LINE")
                  .map((b) => b.Text)
                  .join(" ") || ""
              );

              const ocrResult = analyzeExtractedText(ocrText);
              if (ocrResult.valid) {
                return ocrResult;
              }
            }
          }
        }
      } catch (imgErr) {
        // Continue if embedded image extraction fails
      }

      return analyzeExtractedText(text);
    } catch (pdfErr) {
      console.error("PDF parsing error in owner document validator:", pdfErr);
      throw pdfErr;
    }
  }

  // Image processing via AWS Textract
  const response = await textract
    .detectDocumentText({
      Document: {
        Bytes: buffer,
      },
    })
    .promise();

  const text = (
    response.Blocks?.filter((b) => b.BlockType === "LINE")
      .map((b) => b.Text)
      .join(" ") || ""
  );

  return analyzeExtractedText(text);
};
