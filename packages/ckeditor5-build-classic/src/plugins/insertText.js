import Plugin from "@ckeditor/ckeditor5-core/src/plugin";
import ButtonView from "@ckeditor/ckeditor5-ui/src/button/buttonview";

import checkIcon from "@ckeditor/ckeditor5-core/theme/icons/check.svg";

export default class InsertText extends Plugin {
	init() {
		const editor = this.editor;

		editor.ui.componentFactory.add("insertText", (locale) => {
			const view = new ButtonView(locale);

			view.set({
				label: "Insert text",
				icon: checkIcon,
				tooltip: true,
			});

			// Callback executed once the button is clicked.
			view.on("execute", () => {
				console.log("insert text");
			});

			return view;
		});
	}
}
