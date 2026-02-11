import Twilio from "twilio";

const client = Twilio(
  process.env.TWILIO_ACCOUNT_SID as string,
  process.env.TWILIO_AUTH_TOKEN as string
);

const VERIFY_SID = process.env.TWILIO_VERIFY_SERVICE_SID as string;

/* ---------------- HELPERS ---------------- */

const isEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const isPhone = (value: string) =>
  /^[6-9]\d{9}$/.test(value);

const formatPhone = (phone: string) =>
  phone.startsWith("+") ? phone : `+91${phone}`;

export default {

  /* ======================================================
     1) SEND OTP
  ====================================================== */
  async sendOtp(ctx) {
    try {
      const { identifier } = ctx.request.body;
      if (!identifier) return ctx.badRequest("Identifier required");

      let user;
      let to = identifier;
      let channel: "sms" | "email" = "email";

      // find user
      if (isEmail(identifier)) {
        to = identifier.toLowerCase();
        user = await strapi.db.query("plugin::users-permissions.user").findOne({
          where: { email: to },
        });
      } else if (isPhone(identifier)) {
        to = formatPhone(identifier);
        channel = "sms";

        user = await strapi.db.query("plugin::users-permissions.user").findOne({
          where: { phoneNumber: identifier },
        });
      } else {
        return ctx.badRequest("Invalid email or phone");
      }

      if (!user) return ctx.badRequest("User not found");

      // send OTP via Twilio
      await client.verify.v2.services(VERIFY_SID).verifications.create({
        to,
        channel,
      });

      strapi.log.info(`[FORGOT PASSWORD] OTP sent to ${to}`);

      return ctx.send({ message: "OTP sent successfully" });

    } catch (err) {
      strapi.log.error(err);
      return ctx.internalServerError("Failed to send OTP");
    }
  },

  /* ======================================================
     2) VERIFY OTP
  ====================================================== */
  async verifyOtp(ctx) {
    try {
      const { identifier, otp } = ctx.request.body;
      if (!identifier || !otp)
        return ctx.badRequest("Identifier and OTP required");

      let to = identifier;

      if (isEmail(identifier)) {
        to = identifier.toLowerCase();
      } else if (isPhone(identifier)) {
        to = formatPhone(identifier);
      } else {
        return ctx.badRequest("Invalid identifier");
      }

      // ask Twilio
      const verification = await client.verify.v2
        .services(VERIFY_SID)
        .verificationChecks.create({
          to,
          code: otp,
        });

      if (verification.status !== "approved")
        return ctx.badRequest("Invalid or expired OTP");

      return ctx.send({ verified: true });

    } catch (err) {
      strapi.log.error(err);
      return ctx.badRequest("OTP verification failed");
    }
  },

  /* ======================================================
     3) RESET PASSWORD
  ====================================================== */
  async resetPassword(ctx) {
    try {
      const { identifier, otp, password } = ctx.request.body;

      if (!identifier || !otp || !password)
        return ctx.badRequest("Missing fields");

      let to = identifier;
      let user;

      if (isEmail(identifier)) {
        to = identifier.toLowerCase();
        user = await strapi.db.query("plugin::users-permissions.user").findOne({
          where: { email: to },
        });
      } else if (isPhone(identifier)) {
        to = formatPhone(identifier);
        user = await strapi.db.query("plugin::users-permissions.user").findOne({
          where: { phoneNumber: identifier },
        });
      } else {
        return ctx.badRequest("Invalid identifier");
      }

      if (!user) return ctx.badRequest("User not found");

      // SECURITY → verify again before changing password
      const verification = await client.verify.v2
        .services(VERIFY_SID)
        .verificationChecks.create({
          to,
          code: otp,
        });

      if (verification.status !== "approved")
        return ctx.badRequest("OTP expired. Try again.");

      // hash new password
      const hashedPassword = await strapi
        .plugin("users-permissions")
        .service("user")
        .hashPassword({ password });

      // update
      await strapi.db.query("plugin::users-permissions.user").update({
        where: { id: user.id },
        data: { password: hashedPassword },
      });

      return ctx.send({ message: "Password reset successful" });

    } catch (err) {
      strapi.log.error(err);
      return ctx.internalServerError("Password reset failed");
    }
  },
};
