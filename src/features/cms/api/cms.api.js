import { api } from '@core/api/axiosInstance';

export const cmsApi = {
  homeDraft: () => api.get('/cms/home/draft'),
  homePublished: () => api.get('/cms/home/published'),
  homeVersions: () => api.get('/cms/home/versions'),
  updateHomeDraft: (sections) => api.patch('/cms/home/draft', { sections }),
  publishHome: (note) => api.post('/cms/home/publish', { note }),
  rollbackHome: (versionId, reason) => api.post('/cms/home/rollback', { versionId, reason }),

  categoryTabs: () => api.get('/cms/category-tabs'),
  updateCategoryTab: (id, payload) => api.patch(`/cms/category-tabs/${id}`, payload),
  reorderCategoryTabs: (orderedIds) => api.patch('/cms/category-tabs/reorder', { orderedIds }),
  brandTabs: () => api.get('/cms/brand-tabs'),
  updateBrandTab: (id, payload) => api.patch(`/cms/brand-tabs/${id}`, payload),

  banners: (params) => api.get('/banners', params),
  createBanner: (payload) => api.post('/banners', payload),
  updateBanner: (id, payload) => api.patch(`/banners/${id}`, payload),
  deleteBanner: (id) => api.delete(`/banners/${id}`),

  onboardingSlides: () => api.get('/onboarding-slides'),
  createOnboardingSlide: (payload) => api.post('/onboarding-slides', payload),
  updateOnboardingSlide: (id, payload) => api.patch(`/onboarding-slides/${id}`, payload),
  reorderOnboardingSlides: (orderedIds) => api.patch('/onboarding-slides/reorder', { orderedIds }),
  deleteOnboardingSlide: (id) => api.delete(`/onboarding-slides/${id}`),

  staticPages: () => api.get('/static-pages'),
  staticPage: (id) => api.get(`/static-pages/${id}`),
  updateStaticPage: (id, payload) => api.patch(`/static-pages/${id}`, payload),

  helpCategories: () => api.get('/help-categories'),
  helpCategory: (id) => api.get(`/help-categories/${id}`),
  createHelpCategory: (payload) => api.post('/help-categories', payload),
  updateHelpCategory: (id, payload) => api.patch(`/help-categories/${id}`, payload),
  deleteHelpCategory: (id) => api.delete(`/help-categories/${id}`),
  createHelpArticle: (payload) => api.post('/help-articles', payload),
  updateHelpArticle: (id, payload) => api.patch(`/help-articles/${id}`, payload),
  deleteHelpArticle: (id) => api.delete(`/help-articles/${id}`),
  helpSearchAnalytics: () => api.get('/help-search-analytics'),

  searchRules: (params) => api.get('/search-rules', params),
  createSearchRule: (payload) => api.post('/search-rules', payload),
  updateSearchRule: (id, payload) => api.patch(`/search-rules/${id}`, payload),
  deleteSearchRule: (id) => api.delete(`/search-rules/${id}`),
  trendingSearches: () => api.get('/trending-searches'),
  createTrendingSearch: (payload) => api.post('/trending-searches', payload),
  updateTrendingSearch: (id, payload) => api.patch(`/trending-searches/${id}`, payload),
  deleteTrendingSearch: (id) => api.delete(`/trending-searches/${id}`),
  testSearch: (q) => api.get('/search/test', { q }),

  reasonLists: (listKey) => api.get('/reason-lists', listKey ? { listKey } : undefined),
  createReason: (payload) => api.post('/reason-lists', payload),
  updateReason: (id, payload) => api.patch(`/reason-lists/${id}`, payload),
  deleteReason: (id) => api.delete(`/reason-lists/${id}`),
};

export const cmsKeys = {
  homeDraft: ['cms', 'home', 'draft'],
  homePublished: ['cms', 'home', 'published'],
  homeVersions: ['cms', 'home', 'versions'],
  categoryTabs: ['cms', 'categoryTabs'],
  brandTabs: ['cms', 'brandTabs'],
  banners: (p) => ['cms', 'banners', p],
  onboardingSlides: ['cms', 'onboardingSlides'],
  staticPages: ['cms', 'staticPages'],
  staticPage: (id) => ['cms', 'staticPages', 'detail', id],
  helpCategories: ['cms', 'helpCategories'],
  helpCategory: (id) => ['cms', 'helpCategories', 'detail', id],
  helpSearchAnalytics: ['cms', 'helpSearchAnalytics'],
  searchRules: (p) => ['cms', 'searchRules', p],
  trendingSearches: ['cms', 'trendingSearches'],
  reasonLists: (listKey) => ['cms', 'reasonLists', listKey],
};
