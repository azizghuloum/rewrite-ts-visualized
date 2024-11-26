import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { abcdef } from "@uiw/codemirror-theme-abcdef";
import { useEffect, useState } from "react";

type EditorProps = { code: string; onChange?: (code: string) => void };

export function Editor({ code, onChange }: EditorProps) {
  return (
    <CodeMirror
      value={code}
      extensions={[javascript({ jsx: true, typescript: true }), EditorView.lineWrapping]}
      onChange={onChange}
      readOnly={!onChange}
      theme={abcdef}
    />
  );
}

export function EditorP({ code }: { code: Promise<string> }) {
  const [state, set_state] = useState<null | string>(null);
  useEffect(() => {
    code.then(set_state);
  }, [code]);
  return <Editor code={state === null ? "" : state} />;
}
