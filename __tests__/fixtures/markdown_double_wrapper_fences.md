Path: src/component.tsx

```tsx
const MyComponent = () => {
  return <div>Hello</div>;
};
export default MyComponent;
```

Path: src/utils.js

```javascript
function greet() {
  console.log("Hi");
}
```

Path: src/just_one_line_inside.txt

```
hello
```

Path: src/no_double_wrapping.md
```markdown
This is a standard markdown block.
It should not be stripped.
```

Path: src/fenced_json.json
```json
{
  "name": "doubly_wrapped_json",
  // this comment should be stripped by json stripper
  "version": "1.0.0"
}
```
