export default {
  routes: [
    {
      method: "GET",
      path: "/club-photos/me",
      handler: "club-photo.getMyPhotos",
      config: {
        auth: {},
      },
    },
  ],
};
