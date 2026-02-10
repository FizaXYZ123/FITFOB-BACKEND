export default {
  async register(ctx: any) {
    try {
      const { role, ...userData } = ctx.request.body;

      if (!userData.username || !userData.email || !userData.password || !role) {
        return ctx.badRequest("username, email, password and role required");
      }

      const allowedRoles = ["User", "Client","Public"];
      if (!allowedRoles.includes(role)) {
        return ctx.forbidden("Invalid role");
      }

      // check existing
      const existingUser = await strapi.db
        .query("plugin::users-permissions.user")
        .findOne({ where: { email: userData.email } });

      if (existingUser) {
        return ctx.badRequest("Email already exists");
      }

      // find role
      const roleRecord = await strapi.db
        .query("plugin::users-permissions.role")
        .findOne({ where: { name: role } });

      if (!roleRecord) {
        return ctx.badRequest("Role not found");
      }

      // create user
      const userService = strapi.plugin("users-permissions").service("user");

      const user = await userService.add({
        ...userData,
        role: roleRecord.id,
        provider: "local",
        confirmed: true,
      });

      // jwt
      const jwt = strapi
        .plugin("users-permissions")
        .service("jwt")
        .issue({ id: user.id });

      ctx.send({ jwt, user });
    } catch (err) {
      console.log(err);
      ctx.internalServerError("Registration failed");
    }
  },
};
