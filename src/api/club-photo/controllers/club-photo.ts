
import { factories } from "@strapi/strapi";
import { Context } from "koa";

const CLUB_PHOTO_UID = "api::club-photo.club-photo" as any;
const CLUB_OWNER_UID = "api::club-owner.club-owner" as any;

/* ---------- ROLE HELPER ---------- */
async function getUserRole(user: any): Promise<string> {
  if (!user) return "";
  if (user._cachedRole) return user._cachedRole;

  if (user.role?.name || user.role?.type) {
    const role =
      user.role.name?.toLowerCase().replace(/[\s_-]+/g, "") ||
      user.role.type?.toLowerCase().replace(/[\s_-]+/g, "") ||
      "";
    user._cachedRole = role;
    return role;
  }

  const fullUser: any = await strapi.db
    .query("plugin::users-permissions.user")
    .findOne({
      where: { id: user.id },
      select: ["id"],
      populate: {
        role: {
          select: ["id", "name", "type"],
        },
      },
    });

  const role =
    fullUser?.role?.name?.toLowerCase().replace(/[\s_-]+/g, "") ||
    fullUser?.role?.type?.toLowerCase().replace(/[\s_-]+/g, "") ||
    "";
  user._cachedRole = role;
  return role;
}

/* ---------- CLUB OWNER LOOKUP ---------- */
async function getClubOwnerForUser(user: any) {
  if (!user) {
    console.log("❌ [getClubOwnerForUser] No user object passed");
    return null;
  }
  const userObj = typeof user === "object" ? user : null;
  const userId = userObj ? userObj.id : user;

  console.log("🔍 [getClubOwnerForUser] Finding club owner for userId:", userId);

  if (userObj?._cachedClubOwner) {
    console.log("⚡ [getClubOwnerForUser] Returning cached club owner");
    return userObj._cachedClubOwner;
  }

  let owner: any = await strapi.db.query(CLUB_OWNER_UID).findOne({
    where: { user: userId },
    select: [
      "id",
      "documentId",
      "clubId",
      "clubName",
      "ownerName",
      "phoneNumber",
      "email",
    ],
  });

  if (!owner) {
    console.log("⚠️ [getClubOwnerForUser] Direct query returned null, checking user relation table...");
    const userWithDetail: any = await strapi.db
      .query("plugin::users-permissions.user")
      .findOne({
        where: { id: userId },
        select: ["id"],
        populate: {
          club_owner: {
            select: [
              "id",
              "documentId",
              "clubId",
              "clubName",
              "ownerName",
              "phoneNumber",
              "email",
            ],
          },
        },
      });

    owner = userWithDetail?.club_owner || null;
  }

  console.log("✅ [getClubOwnerForUser] Found owner:", owner ? { id: owner.id, documentId: owner.documentId, clubName: owner.clubName } : "NULL");

  if (userObj && owner) {
    userObj._cachedClubOwner = owner;
  }

  return owner || null;
}

/* ---------- BODY PARSER ---------- */
function getBody(ctx: Context) {
  let body: any = ctx.request.body || {};
  if (body.data && typeof body.data === "string") {
    try {
      body = JSON.parse(body.data);
    } catch {}
  }
  return body;
}

/* ---------- MULTI FILE UPLOAD HELPER ---------- */
async function uploadToFolder(file: any) {
  const uploadService = strapi.plugin("upload").service("upload");
  const filesArray = Array.isArray(file) ? file : [file];
  const uploadedFiles: any[] = [];

  for (const f of filesArray) {
    try {
      const res = await uploadService.upload({
        data: { fileInfo: { folder: 2 } },
        files: f,
      });
      uploadedFiles.push(...res);
    } catch (_) {
      const res = await uploadService.upload({
        data: {},
        files: f,
      });
      uploadedFiles.push(...res);
    }
  }
  return uploadedFiles;
}

export default factories.createCoreController(
  "api::club-photo.club-photo",
  ({ strapi }) => ({
    /* =======================================================
       1. UPLOAD CLUB PHOTO (WITH DESCRIPTION / IMAGE INFO)
    ======================================================= */
    async create(ctx: Context) {
      try {
        const user = ctx.state.user;
        if (!user) {
          return ctx.unauthorized("Authentication required");
        }

        const roleName = await getUserRole(user);
        const body = getBody(ctx);
        let targetOwner: any = null;

        if (roleName === "clubowner") {
          targetOwner = await getClubOwnerForUser(user);
          if (!targetOwner) {
            return ctx.notFound("Club owner profile not found for this user");
          }
        } else if (roleName === "admin" || roleName === "superadmin") {
          const rawOwner = body.club_owner || ctx.query.club_owner;
          if (rawOwner) {
            const isNumeric =
              !isNaN(Number(rawOwner)) && /^\d+$/.test(String(rawOwner));
            targetOwner = await strapi.db.query(CLUB_OWNER_UID).findOne({
              where: isNumeric
                ? { id: Number(rawOwner) }
                : { documentId: String(rawOwner).trim() },
              select: ["id", "documentId", "clubName"],
            });
            if (!targetOwner) {
              return ctx.notFound(`Club owner '${rawOwner}' not found`);
            }
          } else {
            targetOwner = await getClubOwnerForUser(user);
            if (!targetOwner) {
              return ctx.badRequest(
                "club_owner documentId or id is required when uploading photos as Admin",
              );
            }
          }
        } else {
          // Fallback: check if authenticated user has a linked club owner profile
          targetOwner = await getClubOwnerForUser(user);
          if (!targetOwner) {
            return ctx.forbidden(
              "Access denied. Only ClubOwner, Admin, or SuperAdmin can upload club photos.",
            );
          }
        }
        const files: any = ctx.request.files;

        const photoFile =
          files?.image ||
          files?.images ||
          files?.club_photos ||
          files?.clubPhotos ||
          files?.file ||
          files?.photo;

        if (!photoFile) {
          return ctx.badRequest("Please upload a photo file");
        }

        const imageInfo = body.imageInfo || body.description || "";
        const uploadedPhotos = await uploadToFolder(photoFile);
        const photoIds = uploadedPhotos.map((f: any) => f.id);

        let createdPhoto: any = null;

        if ((strapi as any).documents && targetOwner.documentId) {
          try {
            createdPhoto = await (strapi as any).documents(CLUB_PHOTO_UID).create({
              data: {
                imageInfo: imageInfo.trim(),
                images: photoIds,
                club_owner: targetOwner.documentId,
              },
              populate: ["images"],
            });
          } catch (docErr) {
            strapi.log.warn("documents.create fallback in photo upload:", docErr);
          }
        }

        if (!createdPhoto) {
          createdPhoto = await strapi.entityService.create(CLUB_PHOTO_UID, {
            data: {
              imageInfo: imageInfo.trim(),
              images: photoIds,
              club_owner: targetOwner.documentId || targetOwner.id,
            },
            populate: ["images"],
          });
        }

        // 📝 Log Activity (Profile Update)
        try {
          const activityLogService: any = strapi.service(
            "api::club-owner-activity-log.club-owner-activity-log",
          );
          if (activityLogService?.logActivity) {
            activityLogService.logActivity({
              clubOwnerId: targetOwner.documentId || targetOwner.id,
              category: "profile",
              actionType: "UPDATE",
              entityName: "Club Profile",
              entityId: targetOwner.documentId || targetOwner.id,
              description: `Updated club profile: Added club photo${
                imageInfo.trim() ? `: '${imageInfo.trim()}'` : ""
              }`,
            });
          }
        } catch (logErr) {
          strapi.log.warn("[ActivityLog] Failed to log photo upload:", logErr);
        }

        const firstImage = createdPhoto.images?.[0];
        const fileUrl = firstImage?.url
          ? firstImage.url.startsWith("http")
            ? firstImage.url
            : `${strapi.config.server.url}${firstImage.url}`
          : null;

        return ctx.send(
          {
            message: "Club photo uploaded successfully",
            data: {
              id: createdPhoto.id,
              documentId: createdPhoto.documentId,
              imageInfo: createdPhoto.imageInfo,
              fileUrl,
            },
          },
          201,
        );
      } catch (error) {
        strapi.log.error("UPLOAD CLUB PHOTO ERROR:", error);
        return ctx.internalServerError("Failed to upload club photo");
      }
    },

    /* =======================================================
       2. GET MY CLUB PHOTOS (STRICTLY LOGGED-IN CLUB OWNER)
    ======================================================= */
    async getMyPhotos(ctx: Context) {
      console.log("📸 [getMyPhotos] Endpoint hit. Auth header:", ctx.request.headers.authorization ? "Present" : "MISSING");
      try {
        const user = ctx.state.user;
        console.log("👤 [getMyPhotos] ctx.state.user:", user ? { id: user.id, email: user.email } : "NULL");

        if (!user) {
          console.log("❌ [getMyPhotos] Returning 401 Unauthorized");
          return ctx.unauthorized("Authentication required");
        }

        const owner = await getClubOwnerForUser(user);
        if (!owner) {
          console.log("❌ [getMyPhotos] No club owner found for user:", user.id);
          return ctx.notFound("Club owner profile not found for this user");
        }

        console.log("🔍 [getMyPhotos] Fetching photos for club_owner id:", owner.id);

        const photos: any[] = await strapi.db.query(CLUB_PHOTO_UID).findMany({
          where: {
            club_owner: owner.id,
          },
          populate: {
            images: true,
            club_owner: {
              select: ["id", "documentId", "clubName", "clubId"],
            },
          },
          orderBy: { id: "desc" },
        });

        console.log(`✅ [getMyPhotos] Retrieved ${photos.length} photos for club: ${owner.clubName}`);

        const formatted = (photos || []).map((p: any) => {
          const firstImage = p.images?.[0];
          const fileUrl = firstImage?.url
            ? firstImage.url.startsWith("http")
              ? firstImage.url
              : `${strapi.config.server.url}${firstImage.url}`
            : null;

          return {
            id: p.id,
            documentId: p.documentId,
            imageInfo: p.imageInfo,
            fileUrl,
            createdAt: p.createdAt,
          };
        });

        return ctx.send({
          total: formatted.length,
          data: formatted,
        });
      } catch (error) {
        console.error("💥 [getMyPhotos] Exception:", error);
        strapi.log.error("GET MY CLUB PHOTOS ERROR:", error);
        return ctx.internalServerError("Failed to fetch club photos");
      }
    },

    /* =======================================================
       FIND (SCOPED TO LOGGED-IN OWNER)
    ======================================================= */
    async find(ctx: Context) {
      return (this as any).getMyPhotos(ctx);
    },

    /* =======================================================
       FINDONE (FORWARD 'me' TO GETMYPHOTOS)
    ======================================================= */
    async findOne(ctx: Context) {
      if (ctx.params.id === "me") {
        return (this as any).getMyPhotos(ctx);
      }
      return super.findOne(ctx);
    },

    /* =======================================================
       3. UPDATE CLUB PHOTO (DESCRIPTION OR IMAGE)
    ======================================================= */
    async update(ctx: Context) {
      try {
        const { id } = ctx.params;
        const user = ctx.state.user;

        if (!user) {
          return ctx.unauthorized("Authentication required");
        }

        const roleName = await getUserRole(user);
        const documentId = String(id).trim();
        const isNumeric = !isNaN(Number(documentId)) && /^\d+$/.test(documentId);

        const existing: any = await strapi.db.query(CLUB_PHOTO_UID).findOne({
          where: isNumeric ? { id: Number(documentId) } : { documentId },
          select: ["id", "documentId", "imageInfo"],
          populate: {
            club_owner: {
              select: ["id", "documentId"],
            },
          },
        });

        if (!existing) {
          return ctx.notFound("Club photo not found");
        }

        // Ownership check for club owners
        if (roleName === "clubowner") {
          const owner = await getClubOwnerForUser(user);
          if (
            !owner ||
            (existing.club_owner?.documentId !== owner.documentId &&
              existing.club_owner?.id !== owner.id)
          ) {
            return ctx.forbidden(
              "You are not authorized to update photos belonging to another club",
            );
          }
        } else if (roleName !== "admin" && roleName !== "superadmin") {
          return ctx.forbidden("Access denied");
        }

        const body = getBody(ctx);
        const files: any = ctx.request.files;
        const updateData: any = {};

        if (body.imageInfo !== undefined || body.description !== undefined) {
          updateData.imageInfo = (
            body.imageInfo !== undefined ? body.imageInfo : body.description
          )?.trim();
        }

        const photoFile =
          files?.image ||
          files?.images ||
          files?.club_photos ||
          files?.clubPhotos ||
          files?.file ||
          files?.photo;

        if (photoFile) {
          const uploadedPhotos = await uploadToFolder(photoFile);
          const photoIds = uploadedPhotos.map((f: any) => f.id);
          if (photoIds.length > 0) {
            updateData.images = photoIds;
          }
        }

        let updated: any = null;

        if ((strapi as any).documents && existing.documentId) {
          try {
            updated = await (strapi as any).documents(CLUB_PHOTO_UID).update({
              documentId: existing.documentId,
              data: updateData,
              populate: ["images"],
            });
          } catch (docErr) {
            strapi.log.warn("documents.update fallback in photo update:", docErr);
          }
        }

        if (!updated) {
          updated = await strapi.entityService.update(
            CLUB_PHOTO_UID,
            existing.id,
            {
              data: updateData,
              populate: ["images"],
            },
          );
        }

        // 📝 Log Activity
        try {
          const activityLogService: any = strapi.service(
            "api::club-owner-activity-log.club-owner-activity-log",
          );
          if (activityLogService?.logActivity) {
            const ownerIdentifier =
              existing.club_owner?.documentId ||
              existing.club_owner?.id ||
              existing.club_owner;

            const changedParts: string[] = [];
            if (
              updateData.imageInfo !== undefined &&
              updateData.imageInfo !== existing.imageInfo
            ) {
              changedParts.push(
                `imageInfo: '${existing.imageInfo ?? ""}' -> '${updateData.imageInfo}'`,
              );
            }
            if (updateData.images) {
              changedParts.push("replaced image file");
            }

            const changeSummary =
              changedParts.length > 0
                ? ` (Changed: ${changedParts.join(", ")})`
                : "";

            activityLogService.logActivity({
              clubOwnerId: ownerIdentifier,
              category: "profile",
              actionType: "UPDATE",
              entityName: "Club Profile",
              entityId:
                existing.club_owner?.documentId ||
                existing.club_owner?.id ||
                ownerIdentifier,
              description: `Updated club profile: Updated club photo${
                existing.imageInfo ? `: '${existing.imageInfo}'` : ""
              }${changeSummary}`,
            });
          }
        } catch (logErr) {
          strapi.log.warn("[ActivityLog] Failed to log photo update:", logErr);
        }

        return ctx.send({
          message: "Club photo updated successfully",
          data: updated,
        });
      } catch (error) {
        strapi.log.error("UPDATE CLUB PHOTO ERROR:", error);
        return ctx.internalServerError("Failed to update club photo");
      }
    },

    /* =======================================================
       4. DELETE CLUB PHOTO
    ======================================================= */
    async delete(ctx: Context) {
      try {
        const { id } = ctx.params;
        const user = ctx.state.user;

        if (!user) {
          return ctx.unauthorized("Authentication required");
        }

        const roleName = await getUserRole(user);
        const documentId = String(id).trim();
        const isNumeric = !isNaN(Number(documentId)) && /^\d+$/.test(documentId);

        const existing: any = await strapi.db.query(CLUB_PHOTO_UID).findOne({
          where: isNumeric ? { id: Number(documentId) } : { documentId },
          select: ["id", "documentId", "imageInfo"],
          populate: {
            club_owner: {
              select: ["id", "documentId"],
            },
          },
        });

        if (!existing) {
          return ctx.notFound("Club photo not found");
        }

        // Ownership check for club owners
        if (roleName === "clubowner") {
          const owner = await getClubOwnerForUser(user);
          if (
            !owner ||
            (existing.club_owner?.documentId !== owner.documentId &&
              existing.club_owner?.id !== owner.id)
          ) {
            return ctx.forbidden(
              "You are not authorized to delete photos belonging to another club",
            );
          }
        } else if (roleName !== "admin" && roleName !== "superadmin") {
          return ctx.forbidden("Access denied");
        }

        if ((strapi as any).documents && existing.documentId) {
          await (strapi as any).documents(CLUB_PHOTO_UID).delete({
            documentId: existing.documentId,
          });
        } else {
          await strapi.entityService.delete(CLUB_PHOTO_UID, existing.id);
        }

        // 📝 Log Activity
        try {
          const activityLogService: any = strapi.service(
            "api::club-owner-activity-log.club-owner-activity-log",
          );
          if (activityLogService?.logActivity) {
            const ownerIdentifier =
              existing.club_owner?.documentId ||
              existing.club_owner?.id ||
              existing.club_owner;

            activityLogService.logActivity({
              clubOwnerId: ownerIdentifier,
              category: "profile",
              actionType: "UPDATE",
              entityName: "Club Profile",
              entityId:
                existing.club_owner?.documentId ||
                existing.club_owner?.id ||
                ownerIdentifier,
              description: `Updated club profile: Deleted club photo${
                existing.imageInfo ? `: '${existing.imageInfo}'` : ""
              }`,
            });
          }
        } catch (logErr) {
          strapi.log.warn("[ActivityLog] Failed to log photo delete:", logErr);
        }

        return ctx.send({
          message: "Club photo deleted successfully",
          deleted: existing,
        });
      } catch (error) {
        strapi.log.error("DELETE CLUB PHOTO ERROR:", error);
        return ctx.internalServerError("Failed to delete club photo");
      }
    },
  }),
);

