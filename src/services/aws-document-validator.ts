

import AWS from "aws-sdk";

const awsConfig = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
  region: process.env.AWS_REGION || "ap-south-1",
};

const textract = new AWS.Textract(awsConfig);
const rekognition = new AWS.Rekognition(awsConfig);

interface ValidationResult {
  valid: boolean;
  documentType:
    | "aadhaar"
    | "passport"
    | "driving-license"
    | "pan"
    | "voter-id"
    | "unknown";
}

const MIN_CONFIDENCE = 85;

/**
 * ---------------------------------------------------------
 * GET OCR TEXT
 * ---------------------------------------------------------
 */
function getText(
  blocks: AWS.Textract.Block[] | undefined,
): string {
  return (
    blocks
      ?.filter((b) => b.BlockType === "LINE")
      .map((b) => b.Text || "")
      .join(" ")
      .toLowerCase()
      .trim() || ""
  );
}

/**
 * ---------------------------------------------------------
 * GET TEXTRACT QUERY RESULTS
 * ---------------------------------------------------------
 */
function getQueryResults(
  blocks: AWS.Textract.Block[] | undefined,
): Record<
  string,
  {
    text: string;
    confidence: number;
  }
> {
  const results: Record<
    string,
    {
      text: string;
      confidence: number;
    }
  > = {};

  if (!blocks) {
    return results;
  }

  for (const queryBlock of blocks) {
    if (
      queryBlock.BlockType !== "QUERY" ||
      !queryBlock.Query?.Alias ||
      !queryBlock.Relationships
    ) {
      continue;
    }

    const answerRelationship =
      queryBlock.Relationships.find(
        (relationship) =>
          relationship.Type === "ANSWER",
      );

    if (!answerRelationship?.Ids) {
      continue;
    }

    for (const answerId of answerRelationship.Ids) {
      const answerBlock = blocks.find(
        (block) =>
          block.Id === answerId &&
          block.BlockType === "QUERY_RESULT",
      );

      if (!answerBlock) {
        continue;
      }

      results[queryBlock.Query.Alias] = {
        text: answerBlock.Text?.trim() || "",
        confidence: answerBlock.Confidence || 0,
      };
    }
  }

  return results;
}

/**
 * ---------------------------------------------------------
 * CHECK QUERY FIELD
 * ---------------------------------------------------------
 */
function hasQueryField(
  fields: Record<
    string,
    {
      text: string;
      confidence: number;
    }
  >,
  alias: string,
): boolean {
  const field = fields[alias];

  return (
    !!field &&
    field.text.trim().length > 0 &&
    field.confidence >= MIN_CONFIDENCE
  );
}

/**
 * ---------------------------------------------------------
 * FACE / PHOTO CHECK
 * ---------------------------------------------------------
 */
async function hasFace(
  buffer: Buffer,
): Promise<boolean> {
  try {
    const response = await rekognition
      .detectFaces({
        Image: {
          Bytes: buffer,
        },
        Attributes: ["DEFAULT"],
      })
      .promise();

    return (response.FaceDetails || []).some(
      (face) => (face.Confidence || 0) >= 90,
    );
  } catch (error) {
    console.error(
      "Rekognition face detection error:",
      error,
    );

    return false;
  }
}

/**
 * ---------------------------------------------------------
 * NORMALIZE TEXT
 * ---------------------------------------------------------
 */
function normalizeText(text: string): string {
  return text
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * ---------------------------------------------------------
 * CHECK DATE
 * ---------------------------------------------------------
 */
function hasDate(text: string): boolean {
  return (
    /\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}\b/.test(
      text,
    ) ||
    /\b\d{4}[\/.-]\d{1,2}[\/.-]\d{1,2}\b/.test(
      text,
    )
  );
}

/**
 * ---------------------------------------------------------
 * EXTRACT DOCUMENT NUMBER FROM OCR
 * ---------------------------------------------------------
 */
function extractDocumentNumber(
  documentType: ValidationResult["documentType"],
  text: string,
): string | null {
  const normalized = normalizeText(text);

  switch (documentType) {
    /**
     * PAN
     * Example: ABCDE1234F
     */
    case "pan": {
      const matches = normalized.match(
        /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g,
      );

      return matches?.[0] || null;
    }

    /**
     * Aadhaar
     *
     * Supports:
     * 4040 7912 0836
     * 404079120836
     * XXXX XXXX 0836
     */
    case "aadhaar": {
      const maskedMatch = normalized.match(
        /\b(?:X{4,8}|\*{4,8})[\s-]?[0-9]{4}\b/g,
      );

      if (maskedMatch?.[0]) {
        return maskedMatch[0];
      }

      const numberMatches = normalized.match(
        /\b\d{4}[\s-]\d{4}[\s-]\d{4}\b/g,
      );

      if (numberMatches?.[0]) {
        return numberMatches[0];
      }

      const twelveDigit = normalized.match(
        /\b\d{12}\b/g,
      );

      return twelveDigit?.[0] || null;
    }

    /**
     * Passport
     * Example: A1234567
     */
    case "passport": {
      const matches = normalized.match(
        /\b[A-Z][0-9]{7}\b/g,
      );

      return matches?.[0] || null;
    }

    /**
     * Driving Licence
     *
     * DL formats vary by state.
     */
    case "driving-license": {
      const matches = normalized.match(
        /\b[A-Z]{1,5}[- ]?[0-9]{5,20}\b/g,
      );

      return matches?.[0] || null;
    }

    /**
     * Voter ID / EPIC
     * Example: UGU1988278
     */
    case "voter-id": {
      const matches = normalized.match(
        /\b[A-Z]{3}[0-9]{7}\b/g,
      );

      return matches?.[0] || null;
    }

    default:
      return null;
  }
}

/**
 * ---------------------------------------------------------
 * VALIDATE DOCUMENT NUMBER
 * ---------------------------------------------------------
 */
function validateDocumentNumber(
  documentType: ValidationResult["documentType"],
  text: string,
  fields: Record<
    string,
    {
      text: string;
      confidence: number;
    }
  >,
): boolean {
  const queryValue = (alias: string) =>
    fields[alias]?.text
      ?.replace(/\s/g, "")
      .toUpperCase() || "";

  switch (documentType) {
    case "pan": {
      const pan =
        queryValue("PAN_NUMBER") ||
        extractDocumentNumber(
          documentType,
          text,
        );

      return (
        !!pan &&
        /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)
      );
    }

    case "aadhaar": {
      const aadhaar =
        queryValue("AADHAAR_NUMBER") ||
        extractDocumentNumber(
          documentType,
          text,
        );

      if (!aadhaar) {
        return false;
      }

      return (
        /^[0-9]{12}$/.test(aadhaar) ||
        /^[X*]{4,8}[0-9]{4}$/.test(aadhaar)
      );
    }

    case "passport": {
      const passport =
        queryValue("PASSPORT_NUMBER") ||
        extractDocumentNumber(
          documentType,
          text,
        );

      return (
        !!passport &&
        /^[A-Z][0-9]{7}$/.test(passport)
      );
    }

    case "driving-license": {
      const dl =
        queryValue("DL_NUMBER") ||
        extractDocumentNumber(
          documentType,
          text,
        );

      return (
        !!dl &&
        /^[A-Z0-9 -]{6,30}$/.test(dl)
      );
    }

    case "voter-id": {
      const epic =
        queryValue("EPIC_NUMBER") ||
        extractDocumentNumber(
          documentType,
          text,
        );

      return (
        !!epic &&
        /^[A-Z]{3}[0-9]{7}$/.test(epic)
      );
    }

    default:
      return false;
  }
}

/**
 * ---------------------------------------------------------
 * DOCUMENT TYPE DETECTION
 * ---------------------------------------------------------
 */
function detectDocumentType(
  text: string,
): ValidationResult["documentType"] {
  const normalized = text.toLowerCase();

  /**
   * Aadhaar
   */
  if (
    normalized.includes("aadhaar") ||
    normalized.includes("uidai") ||
    normalized.includes(
      "unique identification authority",
    ) ||
    normalized.includes("mera aadhaar")
  ) {
    return "aadhaar";
  }

  /**
   * Passport
   */
  if (
    normalized.includes("passport") ||
    normalized.includes("republic of india")
  ) {
    return "passport";
  }

  /**
   * Driving Licence
   */
  if (
    normalized.includes("driving licence") ||
    normalized.includes("driving license") ||
    normalized.includes("licence to drive") ||
    normalized.includes("transport department") ||
    normalized.includes("motor vehicles")
  ) {
    return "driving-license";
  }

  /**
   * PAN
   */
  if (
    normalized.includes(
      "income tax department",
    ) ||
    normalized.includes(
      "permanent account number",
    ) ||
    normalized.includes("income tax")
  ) {
    return "pan";
  }

  /**
   * Voter ID
   */
  if (
    normalized.includes(
      "election commission",
    ) ||
    normalized.includes(
      "elector photo identity card",
    ) ||
    normalized.includes("epic") ||
    normalized.includes("voter")
  ) {
    return "voter-id";
  }

  return "unknown";
}

/**
 * ---------------------------------------------------------
 * MAIN GOVERNMENT DOCUMENT VALIDATION
 * ---------------------------------------------------------
 */
export const validateGovernmentDocument = async (
  buffer: Buffer,
): Promise<ValidationResult> => {
  try {
    /**
     * -----------------------------------------------------
     * STEP 1: OCR
     * -----------------------------------------------------
     */
    const response = await textract
      .detectDocumentText({
        Document: {
          Bytes: buffer,
        },
      })
      .promise();

    const text = getText(response.Blocks);

    // console.log(
    //   "TEXTRACT OCR TEXT:",
    //   text,
    // );

    /**
     * -----------------------------------------------------
     * STEP 2: DETECT DOCUMENT TYPE
     * -----------------------------------------------------
     */
    const documentType =
      detectDocumentType(text);

    // console.log(
    //   "DETECTED DOCUMENT TYPE:",
    //   documentType,
    // );

    if (documentType === "unknown") {
      return {
        valid: false,
        documentType: "unknown",
      };
    }

    /**
     * -----------------------------------------------------
     * STEP 3: TEXTRACT QUERIES
     *
     * Queries are now SUPPORTING validation.
     * They are NOT the only source of validation.
     * -----------------------------------------------------
     */
    const queries = {
      aadhaar: [
        {
          Text: "What is the Aadhaar number?",
          Alias: "AADHAAR_NUMBER",
        },
        {
          Text: "What is the name of the Aadhaar holder?",
          Alias: "NAME",
        },
        {
          Text: "What is the date of birth?",
          Alias: "DOB",
        },
      ],

      passport: [
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
      ],

      "driving-license": [
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
      ],

      pan: [
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
      ],

      "voter-id": [
        {
          Text: "What is the EPIC number or voter ID number?",
          Alias: "EPIC_NUMBER",
        },
        {
          Text: "What is the name of the voter?",
          Alias: "NAME",
        },
      ],
    };

    let analyzeResponse:
      | AWS.Textract.AnalyzeDocumentResponse
      | undefined;

    try {
      analyzeResponse = await textract
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
            Queries: queries[documentType],
          },
        })
        .promise();
    } catch (error) {
      /**
       * If query analysis fails, continue with
       * normal OCR validation.
       */
      console.error(
        "Textract AnalyzeDocument error:",
        error,
      );
    }

    const fields = getQueryResults(
      analyzeResponse?.Blocks,
    );

    // console.log(
    //   "TEXTRACT QUERY FIELDS:",
    //   fields,
    // );

    /**
     * -----------------------------------------------------
     * STEP 4: DOCUMENT NUMBER
     *
     * Query result OR normal OCR can provide the number.
     * -----------------------------------------------------
     */
    const documentNumberValid =
      validateDocumentNumber(
        documentType,
        text,
        fields,
      );

    if (!documentNumberValid) {
      console.log(
        "DOCUMENT NUMBER VALIDATION FAILED",
      );

      return {
        valid: false,
        documentType,
      };
    }

    /**
     * -----------------------------------------------------
     * STEP 5: DOCUMENT-SPECIFIC CONTENT VALIDATION
     * -----------------------------------------------------
     */
    const normalizedText =
      normalizeText(text);

    switch (documentType) {
      /**
       * ---------------------------------------------------
       * AADHAAR
       * ---------------------------------------------------
       */
      case "aadhaar": {
        const hasAadhaarIdentity =
          normalizedText.includes("AADHAAR") ||
          normalizedText.includes("UIDAI") ||
          normalizedText.includes(
            "GOVERNMENT OF INDIA",
          );

        if (!hasAadhaarIdentity) {
          return {
            valid: false,
            documentType,
          };
        }

        /**
         * Aadhaar should have a date/year of birth.
         */
        const hasDob =
          hasDate(normalizedText) ||
          hasQueryField(fields, "DOB");

        if (!hasDob) {
          return {
            valid: false,
            documentType,
          };
        }

        break;
      }

      /**
       * ---------------------------------------------------
       * PASSPORT
       * ---------------------------------------------------
       */
      case "passport": {
        if (
          !normalizedText.includes("PASSPORT") &&
          !normalizedText.includes(
            "REPUBLIC OF INDIA",
          )
        ) {
          return {
            valid: false,
            documentType,
          };
        }

        if (
          !hasDate(normalizedText) &&
          !hasQueryField(fields, "DOB")
        ) {
          return {
            valid: false,
            documentType,
          };
        }

        break;
      }

      /**
       * ---------------------------------------------------
       * DRIVING LICENCE
       * ---------------------------------------------------
       */
      case "driving-license": {
        const hasDrivingIdentity =
          normalizedText.includes(
            "DRIVING LICENCE",
          ) ||
          normalizedText.includes(
            "DRIVING LICENSE",
          ) ||
          normalizedText.includes(
            "LICENCE TO DRIVE",
          ) ||
          normalizedText.includes(
            "TRANSPORT",
          ) ||
          normalizedText.includes(
            "MOTOR VEHICLES",
          );

        if (!hasDrivingIdentity) {
          return {
            valid: false,
            documentType,
          };
        }

        if (
          !hasDate(normalizedText) &&
          !hasQueryField(fields, "DOB")
        ) {
          return {
            valid: false,
            documentType,
          };
        }

        break;
      }

      /**
       * ---------------------------------------------------
       * PAN
       * ---------------------------------------------------
       */
      case "pan": {
        const hasPanIdentity =
          normalizedText.includes(
            "INCOME TAX",
          ) ||
          normalizedText.includes(
            "PERMANENT ACCOUNT NUMBER",
          );

        if (!hasPanIdentity) {
          return {
            valid: false,
            documentType,
          };
        }

        if (
          !hasDate(normalizedText) &&
          !hasQueryField(fields, "DOB")
        ) {
          return {
            valid: false,
            documentType,
          };
        }

        break;
      }

      /**
       * ---------------------------------------------------
       * VOTER ID
       * ---------------------------------------------------
       */
      case "voter-id": {
        const hasVoterIdentity =
          normalizedText.includes(
            "ELECTION COMMISSION",
          ) ||
          normalizedText.includes(
            "ELECTOR PHOTO IDENTITY CARD",
          ) ||
          normalizedText.includes(
            "ELECTOR",
          ) ||
          normalizedText.includes(
            "EPIC",
          );

        if (!hasVoterIdentity) {
          return {
            valid: false,
            documentType,
          };
        }

        break;
      }

      default:
        return {
          valid: false,
          documentType: "unknown",
        };
    }

    /**
     * -----------------------------------------------------
     * STEP 6: PHOTO CHECK
     *
     * All five supported IDs contain a human photo.
     * -----------------------------------------------------
     */
    const photoExists =
      await hasFace(buffer);

    if (!photoExists) {
      console.log(
        "DOCUMENT PHOTO / FACE NOT DETECTED",
      );

      return {
        valid: false,
        documentType,
      };
    }

    /**
     * -----------------------------------------------------
     * STEP 7: VALID
     * -----------------------------------------------------
     */
    // console.log(
    //   "GOVERNMENT DOCUMENT VALID:",
    //   documentType,
    // );

    return {
      valid: true,
      documentType,
    };
  } catch (error) {
    console.error(
      "Government document validation error:",
      error,
    );

    return {
      valid: false,
      documentType: "unknown",
    };
  }
};