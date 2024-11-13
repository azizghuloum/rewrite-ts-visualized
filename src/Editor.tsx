import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { abcdef } from "@uiw/codemirror-theme-abcdef";

type EditorProps = { code: string; onChange?: (code: string) => void };

export function Editor({ code, onChange }: EditorProps) {
  return (
    <CodeMirror
      value={code}
      extensions={[javascript({ jsx: true, typescript: true })]}
      onChange={onChange}
      readOnly={!onChange}
      theme={abcdef}
    />
  );
}
