/** JSON for a `<script>` body: `<` becomes `\u003c`, so text like `</script>` cannot close the tag. Parses back to the same value. */
export const jsonForScript = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");
