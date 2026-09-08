/**
 * Resolves club service and facility inputs (numeric IDs, documentIds, objects, or names)
 * into an array of numeric database IDs for relation linking.
 */

export async function resolveClubServiceIds(servicesInput: any): Promise<number[]> {
  if (!servicesInput) return [];

  let items = servicesInput;
  if (typeof items === "string") {
    try {
      items = JSON.parse(items);
    } catch {
      items = [items];
    }
  }

  if (!Array.isArray(items)) {
    if (typeof items === "object" && items !== null) {
      items = Object.values(items);
    } else {
      items = [items];
    }
  }

  const ids: number[] = [];

  for (const item of items) {
    if (!item) continue;

    // 1. Direct number ID
    if (typeof item === "number" && !isNaN(item)) {
      ids.push(item);
      continue;
    }

    // 2. Object with id, documentId, name, or serviceName
    if (typeof item === "object") {
      if (typeof item.id === "number" && !isNaN(item.id)) {
        ids.push(item.id);
        continue;
      }

      const docId = item.documentId || item.document_id;
      if (docId) {
        const found: any = await strapi.db
          .query("api::club-service.club-service")
          .findOne({
            where: { documentId: String(docId).trim() },
            select: ["id"],
          });
        if (found?.id) {
          ids.push(found.id);
          continue;
        }
      }

      const nameStr = item.name || item.serviceName || item.service_name || item.title;
      if (nameStr) {
        const name = String(nameStr).trim();
        const found: any = await strapi.db
          .query("api::club-service.club-service")
          .findOne({
            where: {
              $or: [{ name }, { name: { $eqi: name } }],
            },
            select: ["id"],
          });
        if (found?.id) {
          ids.push(found.id);
          continue;
        }
      }
    }

    // 3. String (could be numeric ID, documentId, or service name)
    if (typeof item === "string") {
      const str = item.trim();
      if (!isNaN(Number(str))) {
        ids.push(Number(str));
        continue;
      }

      const found: any = await strapi.db
        .query("api::club-service.club-service")
        .findOne({
          where: {
            $or: [{ documentId: str }, { name: str }, { name: { $eqi: str } }],
          },
          select: ["id"],
        });
      if (found?.id) {
        ids.push(found.id);
      }
    }
  }

  return Array.from(new Set(ids));
}

export async function resolveClubFacilityIds(facilitiesInput: any): Promise<number[]> {
  if (!facilitiesInput) return [];

  let items = facilitiesInput;
  if (typeof items === "string") {
    try {
      items = JSON.parse(items);
    } catch {
      items = [items];
    }
  }

  if (!Array.isArray(items)) {
    if (typeof items === "object" && items !== null) {
      items = Object.values(items);
    } else {
      items = [items];
    }
  }

  const ids: number[] = [];

  for (const item of items) {
    if (!item) continue;

    // 1. Direct number ID
    if (typeof item === "number" && !isNaN(item)) {
      ids.push(item);
      continue;
    }

    // 2. Object with id, documentId, name, or facilityName
    if (typeof item === "object") {
      if (typeof item.id === "number" && !isNaN(item.id)) {
        ids.push(item.id);
        continue;
      }

      const docId = item.documentId || item.document_id;
      if (docId) {
        const found: any = await strapi.db
          .query("api::club-facility.club-facility")
          .findOne({
            where: { documentId: String(docId).trim() },
            select: ["id"],
          });
        if (found?.id) {
          ids.push(found.id);
          continue;
        }
      }

      const nameStr = item.name || item.facilityName || item.facility_name || item.title;
      if (nameStr) {
        const name = String(nameStr).trim();
        const found: any = await strapi.db
          .query("api::club-facility.club-facility")
          .findOne({
            where: {
              $or: [{ name }, { name: { $eqi: name } }],
            },
            select: ["id"],
          });
        if (found?.id) {
          ids.push(found.id);
          continue;
        }
      }
    }

    // 3. String (could be numeric ID, documentId, or facility name)
    if (typeof item === "string") {
      const str = item.trim();
      if (!isNaN(Number(str))) {
        ids.push(Number(str));
        continue;
      }

      const found: any = await strapi.db
        .query("api::club-facility.club-facility")
        .findOne({
          where: {
            $or: [{ documentId: str }, { name: str }, { name: { $eqi: str } }],
          },
          select: ["id"],
        });
      if (found?.id) {
        ids.push(found.id);
      }
    }
  }

  return Array.from(new Set(ids));
}
