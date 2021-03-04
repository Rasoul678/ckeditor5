# CKEditor 5 custom balloon block editor build

## Quick start

First, install the build from npm:

```bash
npm install --save @rasoul678/ckeditor5-custom-balloon-block
```

And use it in your react app:

```js
import { CKEditor } from "@ckeditor/ckeditor5-react";
import BalloonBlockEditor from "@rasoul678/ckeditor5-custom-balloon-block";

const TestView = () => {
	const [data, setData] = useState("<p>Hello from CKEditor 5!</p>");

	useEffect(() => {
		console.log(data);
	}, [data]);

	return (
		<div>
			<h2>Using CKEditor 5 build in React</h2>
			<CKEditor
				editor={BalloonBlockEditor}
				data={data}
				onReady={(editor) => {
					console.log("Editor is ready to use!", editor);
				}}
				onChange={(event, editor) => {
					const data = editor.getData();
					setData(data);
					console.log({ event, editor, data });
				}}
				onBlur={(event, editor) => {
					console.log("Blur.", editor);
				}}
				onFocus={(event, editor) => {
					console.log("Focus.", editor);
				}}
			/>
		</div>
	);
};

export default TestView;
```
