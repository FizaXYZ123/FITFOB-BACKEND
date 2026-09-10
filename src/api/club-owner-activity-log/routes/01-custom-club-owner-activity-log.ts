export default {
  routes: [
    {
      method: "GET",
      path: "/club-owner-activity-logs/me",
      handler: "club-owner-activity-log.getMyLogs",
      config: {
        auth: {},
      },
    },
  ],
};
