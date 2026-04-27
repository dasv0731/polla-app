// Originalmente este archivo re-exportaba el tipo Schema desde el repo
// hermano polla-backend (../../../../../polla-backend/amplify/data/resource).
// Funciona local porque los repos viven side-by-side, pero rompe en CI
// (Amplify Hosting / GitHub Actions) — solo tienen este repo checked out.
//
// Hasta que publiquemos polla-backend como package npm interno (o usemos
// un monorepo), declaramos Schema como tipo permisivo. El cliente
// (apiClient.models.X.get/list/create/update/delete) sigue funcionando en
// runtime. Type safety por modelo se mantiene a través de los wrappers en
// api.service.ts y de los castings explícitos en cada componente.
export type Schema = {
  models: Record<string, any>;
  queries: Record<string, any>;
  mutations: Record<string, any>;
};
