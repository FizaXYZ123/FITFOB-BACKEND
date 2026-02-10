export default {
  routes: [
    {
      method: "POST",
      path: "/register-with-role",
      handler: "register-with-role.register",
      config: {
        auth: false,
      },
    },
  ],
};
