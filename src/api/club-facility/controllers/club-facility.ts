/**
 * club-facility controller
 */

import { factories } from "@strapi/strapi";
import { Context } from "koa";

export default factories.createCoreController(
  "api::club-facility.club-facility",
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

        const entries: any[] = await strapi.entityService.findMany(
          "api::club-facility.club-facility",
          {
            filters,
            populate: {
              logo: true,
            },
            sort: { createdAt: "desc" },
          },
        );

        const data = entries.map((item: any) => {
          let logoUrl = null;
          if (item.logo?.url) {
            logoUrl = item.logo.url.startsWith("http")
              ? item.logo.url
              : `${strapi.config.server.url || ""}${item.logo.url}`;
          }

          return {
            name: item.name,
            logo: logoUrl,
            isActive: item.isActive,
            createdAt: item.createdAt,
          };
        });

        ctx.body = data;
      } catch (error) {
        strapi.log.error("FETCH CLUB FACILITIES ERROR:", error);
        return ctx.internalServerError("Failed to fetch club facilities");
      }
    },
  }),
);
