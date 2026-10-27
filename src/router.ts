import { createRouter, createWebHistory } from 'vue-router'
import AdminLibrary from './pages/admin/AdminLibrary.vue'
import AdminWorkEdit from './pages/admin/AdminWorkEdit.vue'
import AdminWorkNew from './pages/admin/AdminWorkNew.vue'
import AdminWorkProgress from './pages/admin/AdminWorkProgress.vue'
import NotFound from './pages/NotFound.vue'
import PublicHome from './pages/PublicHome.vue'
import PublicWork from './pages/PublicWork.vue'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: PublicHome,
    },
    {
      path: '/works/:id',
      name: 'work',
      component: PublicWork,
    },
    {
      path: '/admin',
      name: 'admin-library',
      component: AdminLibrary,
      meta: { wide: true },
    },
    {
      path: '/admin/works/new',
      name: 'admin-work-new',
      component: AdminWorkNew,
      meta: { wide: true },
    },
    {
      path: '/admin/works/:id/edit',
      name: 'admin-work-edit',
      component: AdminWorkEdit,
      meta: { wide: true },
    },
    {
      path: '/admin/works/:id/progress',
      name: 'admin-work-progress',
      component: AdminWorkProgress,
      meta: { wide: true },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: NotFound,
    },
  ],
  scrollBehavior(_to, _from, savedPosition) {
    if (savedPosition) return savedPosition
    return { top: 0 }
  },
})
