import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  index("routes/library-index.tsx"),
  layout("routes/library.tsx", [
    route("books/:id", "routes/book.tsx"),
    route("books/:id/details", "routes/book-details.tsx"),
  ]),
  route("workspace", "routes/workspace.tsx"),
] satisfies RouteConfig;
