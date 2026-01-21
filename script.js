let editor;
const outputDiv = document.getElementById('output-container');
const inputField = document.getElementById('term-input');
const langSelect = document.getElementById('lang-select');

const langConfig = {
    python: { language: "python", version: "3.10.0" },
    cpp: { language: "c++", version: "10.2.0" },
    csharp: { language: "csharp.net", version: "5.0.201" },
    java: { language: "java", version: "15.0.2" },
    javascript: { language: "javascript", version: "18.15.0" },
    sql: { language: "sqlite3", version: "3.36.0" },
    rust: { language: "rust", version: "1.68.2" },
    lua: { language: "lua", version: "5.4.4" },
    zig: { language: "zig", version: "0.10.1" },
    scala: { language: "scala", version: "3.2.2" },
    go: { language: "go", version: "1.16.2" }
};

const templates = {
    python: "import time\n\nprint('Hello from NOC!')\nname = input('What is your name? ')\nprint(f'Nice to meet you, {name}!')",
    cpp: "#include <iostream>\nusing namespace std;\n\nint main() {\n    string name;\n    cout << \"Enter name: \";\n    cin >> name;\n    cout << \"Hello \" << name << \" from C++!\" << endl;\n    return 0;\n}",
    csharp: "using System;\n\nclass Program {\n    static void Main() {\n        Console.WriteLine(\"Hello from C#!\");\n    }\n}",
    java: "import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner scanner = new Scanner(System.in);\n        System.out.print(\"Enter name: \");\n        String name = scanner.nextLine();\n        System.out.println(\"Hello \" + name + \" from Java!\");\n    }\n}",
    javascript: "console.log('Hello from Node.js!');",
    sql: "CREATE TABLE Users (ID INT, Name TEXT);\nINSERT INTO Users VALUES (1, 'Neo'), (2, 'Trinity');\nSELECT * FROM Users;",
    rust: "fn main() {\n    println!(\"Hello from Rust!\");\n}",
    lua: "print('Hello from Lua!')",
    zig: "const std = @import(\"std\");\n\npub fn main() void {\n    std.debug.print(\"Hello from Zig!\\n\", .{});\n}",
    scala: "object Main extends App {\n  println(\"Hello from Scala!\")\n}",
    go: "package main\nimport \"fmt\"\n\nfunc main() {\n    fmt.Println(\"Hello from Golang!\")\n}"
};

require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.34.1/min/vs' }});
require(['vs/editor/editor.main'], function() {
    editor = monaco.editor.create(document.getElementById('editor-container'), {
        value: templates['python'],
        language: 'python',
        theme: 'vs-dark',
        automaticLayout: true,
        fontSize: 14,
        minimap: { enabled: true },
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        glyphMargin: true,
        folding: true,
        lineNumbersMinChars: 3,
        lineDecorationsWidth: 10,
        renderLineHighlight: 'all',
        quickSuggestions: true,
        suggestOnTriggerCharacters: true
    });

    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: false,
        noSyntaxValidation: false
    });

    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: false,
        noSyntaxValidation: false
    });
});

function changeLanguage() {
    const lang = langSelect.value;
    let monacoLang = lang;
    
    if (lang === 'csharp') monacoLang = 'csharp';
    else if (lang === 'cpp') monacoLang = 'cpp';
    else if (lang === 'java') monacoLang = 'java';
    else if (lang === 'rust') monacoLang = 'rust';
    else if (lang === 'go') monacoLang = 'go';
    else if (lang === 'sql') monacoLang = 'sql';
    else if (lang === 'lua') monacoLang = 'lua';
    else if (lang === 'scala') monacoLang = 'scala';
    
    monaco.editor.setModelLanguage(editor.getModel(), monacoLang);
    editor.setValue(templates[lang]);
    outputDiv.innerHTML = `<span class="info-text">[Switched to ${lang}]</span>\n`;
}

function formatOutput(text, isError = false) {
    if (!text) return '';
    
    let formatted = text;
    
    formatted = formatted.replace(
        /(ERROR!|Error|error|Exception|Traceback|Failed|failed|FAILED)/gi,
        '<span class="error-text">$1</span>'
    );
    
    formatted = formatted.replace(
        /(SyntaxError|TypeError|ValueError|RuntimeError|NameError|AttributeError|KeyError|IndexError|ZeroDivisionError|ImportError|ModuleNotFoundError)/g,
        '<span class="error-text">$1</span>'
    );
   
    formatted = formatted.replace(
        /(File\s+".+?",\s+line\s+\d+)/g,
        '<span class="file-path">$1</span>'
    );
    
    formatted = formatted.replace(
        /(Compilation\s+error|compilation\s+failed|compile\s+error)/gi,
        '<span class="error-text">$1</span>'
    );
   
    formatted = formatted.replace(
        /(\^+|\~+)/g,
        '<span class="error-text">$1</span>'
    );
    
    formatted = formatted.replace(
        /(Warning|warning|warn)/g,
        '<span class="warning-text">$1</span>'
    );
    
    formatted = formatted.replace(
        /(line\s+\d+|Line\s+\d+)/g,
        '<span class="warning-text">$1</span>'
    );
    
    return formatted;
}

async function runCode() {
    const code = editor.getValue();
    const langKey = langSelect.value;
    const config = langConfig[langKey];

    outputDiv.innerHTML = '<span class="info-text">> Running...</span>\n';
    inputField.disabled = false;
    inputField.placeholder = "Enter inputs (one per line) then press Run again...";
    
    const userInput = inputField.value;

    try {
        const response = await fetch("https://emkc.org/api/v2/piston/execute", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "language": config.language,
                "version": config.version,
                "files": [{ "content": code }],
                "stdin": userInput
            })
        });

        const result = await response.json();
        
        if (result.run) {
            const stdout = result.run.stdout || '';
            const stderr = result.run.stderr || '';
            const hasError = stderr.length > 0 || result.run.code !== 0;
            
            outputDiv.innerHTML = '';
            
            if (stdout) {
                outputDiv.innerHTML += formatOutput(stdout, false);
            }
           
            if (stderr) {
                if (stdout) outputDiv.innerHTML += '\n';
                outputDiv.innerHTML += '<span class="error-text">ERROR!</span>\n';
                outputDiv.innerHTML += formatOutput(stderr, true);
            }
            
            if (hasError) {
                outputDiv.innerHTML += '\n<span class="error-text">[Execution Failed]</span>';
            } else {
                outputDiv.innerHTML += '\n<span class="success-text">[Execution Successful]</span>';
            }
        } else {
            outputDiv.innerHTML = '<span class="error-text">ERROR!</span>\n[No output from execution server]';
            outputDiv.innerHTML += '\n<span class="error-text">[Execution Failed]</span>';
        }
        
        outputDiv.scrollTop = outputDiv.scrollHeight;
        
    } catch (error) {
        outputDiv.innerHTML = '<span class="error-text">ERROR!</span>\n';
        outputDiv.innerHTML += `<span class="error-text">[Error]: Could not connect to execution server.</span>\n`;
        outputDiv.innerHTML += `<span class="warning-text">Details: ${error.message}</span>\n`;
        outputDiv.innerHTML += '<span class="error-text">[Execution Failed]</span>';
    }
}

inputField.addEventListener("keypress", function(event) {
    if (event.key === "Enter") {
        outputDiv.innerHTML += '<span class="info-text">\n> Input registered. Click \'Run\' to execute with this input.</span>\n';
        outputDiv.scrollTop = outputDiv.scrollHeight;
    }
});
