import { createRouter, createWebHistory } from "vue-router";
import ProjectListPage from "./views/ProjectListPage.vue";
import ProjectWorkspacePage from "./views/ProjectWorkspacePage.vue";

/** 应用的正式路由表。 */
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      redirect: "/projects",
    },
    {
      path: "/projects",
      name: "project-list",
      component: ProjectListPage,
    },
    {
      path: "/projects/:projectId",
      name: "project-workspace",
      component: ProjectWorkspacePage,
    },
    {
      path: "/:pathMatch(.*)*",
      redirect: "/projects",
    },
  ],
});
