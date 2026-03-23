import { type RouteConfig, layout, route } from "@react-router/dev/routes";

export default [
  layout("routes/library.tsx", [
    route("library", "routes/library-index.tsx"),
    route("books/:id", "routes/book.tsx"),
  ]),
  route("workspace", "routes/workspace.tsx"),
] satisfies RouteConfig;
