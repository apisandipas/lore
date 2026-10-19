// Text files imported with `with { type: "text" }` arrive as strings.
declare module "*.txt" {
  const content: string;
  export default content;
}
declare module "*.md" {
  const content: string;
  export default content;
}
