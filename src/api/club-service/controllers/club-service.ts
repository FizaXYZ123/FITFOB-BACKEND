/**
 * club-service controller
 */

import { factories } from "@strapi/strapi";
import { Context } from "koa";

export default factories.createCoreController(
  "api::club-service.club-service",
  ({ strapi }) => ({
    async find(ctx: Context) {
      try {
        const { isActive } = ctx.query as any;

        const filters: any = {};

        // By default return all. If isActive is provided as true/false, filter by that.
        if (isActive === "true" || isActive === true) {
          filters.isActive = true;
        } else if (isActive === "false" || isActive === false) {
          filters.isActive = false;
        }

        let entries: any[] = [];
        if ((strapi as any).documents) {
          entries = await (strapi as any)
            .documents("api::club-service.club-service")
            .findMany({
              filters,
              populate: {
                logo: true,
              },
              sort: { createdAt: "desc" },
            });
        } else {
          entries = await strapi.entityService.findMany(
            "api::club-service.club-service",
            {
              filters,
              populate: {
                logo: true,
              },
              sort: { createdAt: "desc" },
            },
          );
        }

        const data = (entries || []).map((item: any) => {
          let logoUrl = null;
          if (item.logo?.url) {
            logoUrl = item.logo.url.startsWith("http")
              ? item.logo.url
              : `${strapi.config.server.url || ""}${item.logo.url}`;
          }

          return {
            documentId: item.documentId || null,
            name: item.name,
            logo: logoUrl,
            isActive: item.isActive,
            createdAt: item.createdAt,
          };
        });

        ctx.body = data;
      } catch (error) {
        strapi.log.error("FETCH CLUB SERVICES ERROR:", error);
        return ctx.internalServerError("Failed to fetch club services");
      }
    },

    async findOne(ctx: Context) {
      try {
        const { id } = ctx.params;

        if (!id) {
          return ctx.badRequest("Document ID is required");
        }

        const documentId = String(id).trim();

        let item: any = null;
        if ((strapi as any).documents) {
          item = await (strapi as any)
            .documents("api::club-service.club-service")
            .findOne({
              documentId,
              populate: {
                logo: true,
              },
            });
        }

        if (!item) {
          item = await strapi.db
            .query("api::club-service.club-service")
            .findOne({
              where: { documentId },
              populate: {
                logo: true,
              },
            });
        }

        if (!item) {
          return ctx.notFound("Club service not found");
        }

        let logoUrl = null;
        if (item.logo?.url) {
          logoUrl = item.logo.url.startsWith("http")
            ? item.logo.url
            : `${strapi.config.server.url || ""}${item.logo.url}`;
        }

        const data = {
          documentId: item.documentId || null,
          name: item.name,
          logo: logoUrl,
          isActive: item.isActive,
          createdAt: item.createdAt,
        };

        ctx.body = data;
      } catch (error) {
        strapi.log.error("FETCH CLUB SERVICE ERROR:", error);
        return ctx.internalServerError("Failed to fetch club service");
      }
    },

    async update(ctx: Context) {
      try {
        const { id } = ctx.params;

        if (!id) {
          return ctx.badRequest("Document ID is required");
        }

        const documentId = String(id).trim();

        const body = (ctx.request.body as any) ?? {};
        const payload = body.data !== undefined ? body.data : body;

        let item: any = null;

        if ((strapi as any).documents) {
          try {
            item = await (strapi as any)
              .documents("api::club-service.club-service")
              .update({
                documentId,
                data: payload,
                populate: {
                  logo: true,
                },
              });
          } catch (docErr) {
            strapi.log.warn(
              "documents.update error in club-service update:",
              docErr,
            );
          }
        }

        if (!item) {
          const existing = await strapi.db
            .query("api::club-service.club-service")
            .findOne({
              where: { documentId },
            });

          if (!existing) {
            return ctx.notFound("Club service not found");
          }

          await strapi.entityService.update(
            "api::club-service.club-service",
            existing.id,
            {
              data: payload,
            },
          );

          if ((strapi as any).documents) {
            item = await (strapi as any)
              .documents("api::club-service.club-service")
              .findOne({
                documentId,
                populate: {
                  logo: true,
                },
              });
          } else {
            item = await strapi.entityService.findOne(
              "api::club-service.club-service",
              existing.id,
              {
                populate: {
                  logo: true,
                },
              },
            );
          }
        }

        if (!item) {
          return ctx.notFound("Club service not found");
        }

        let logoUrl = null;
        if (item.logo?.url) {
          logoUrl = item.logo.url.startsWith("http")
            ? item.logo.url
            : `${strapi.config.server.url || ""}${item.logo.url}`;
        }

        const data = {
          documentId: item.documentId || null,
          name: item.name,
          logo: logoUrl,
          isActive: item.isActive,
          createdAt: item.createdAt,
        };

        ctx.body = data;
      } catch (error) {
        strapi.log.error("UPDATE CLUB SERVICE ERROR:", error);
        return ctx.internalServerError("Failed to update club service");
      }
    },

    async create(ctx: Context) {
      try {
        const body = (ctx.request.body as any) ?? {};
        const payload = body.data !== undefined ? body.data : body;

        let item: any = null;

        if ((strapi as any).documents) {
          try {
            item = await (strapi as any)
              .documents("api::club-service.club-service")
              .create({
                data: payload,
                populate: {
                  logo: true,
                },
              });
          } catch (docErr) {
            strapi.log.warn(
              "documents.create error in club-service create:",
              docErr,
            );
          }
        }

        if (!item) {
          const created = await strapi.entityService.create(
            "api::club-service.club-service",
            {
              data: payload,
            },
          );

          if ((strapi as any).documents && (created as any)?.documentId) {
            item = await (strapi as any)
              .documents("api::club-service.club-service")
              .findOne({
                documentId: (created as any).documentId,
                populate: {
                  logo: true,
                },
              });
          } else {
            item = await strapi.entityService.findOne(
              "api::club-service.club-service",
              created.id,
              {
                populate: {
                  logo: true,
                },
              },
            );
          }
        }

        let logoUrl = null;
        if (item?.logo?.url) {
          logoUrl = item.logo.url.startsWith("http")
            ? item.logo.url
            : `${strapi.config.server.url || ""}${item.logo.url}`;
        }

        const data = {
          documentId: item?.documentId || null,
          name: item?.name,
          logo: logoUrl,
          isActive: item?.isActive,
          createdAt: item?.createdAt,
        };

        ctx.body = data;
      } catch (error) {
        strapi.log.error("CREATE CLUB SERVICE ERROR:", error);
        return ctx.internalServerError("Failed to create club service");
      }
    },
  }),
);
