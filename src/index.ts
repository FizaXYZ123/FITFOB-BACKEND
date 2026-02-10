import { createCognitoUser } from "./services/cognito-provision";

export default {
  register() {},

  async bootstrap({ strapi }) {

    // Subscribe to DB lifecycle for plugin USER
    strapi.db.lifecycles.subscribe({
      models: ["plugin::users-permissions.user"],

      async afterCreate(event) {
        const { result } = event;

        const email = result.email;
        const name = result.username || result.email;

        // VERY IMPORTANT: run after transaction commit
        setTimeout(async () => {
          try {
            strapi.log.info("Provisioning Cognito user: " + email);

            const cognitoSub = await createCognitoUser(email, name);

            // Direct DB query (NOT entityService)
            await strapi.db
              .query("plugin::users-permissions.user")
              .update({
                where: { id: result.id },
                data: { cognitoSub },
              });

            strapi.log.info("Cognito ID saved into Strapi user");

          } catch (err) {
            strapi.log.error("Cognito provisioning failed:", err);
          }
        }, 800); 
      },
    });
  },
};
