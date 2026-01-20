from flask import Flask, render_template
from flask_socketio import SocketIO
from PySide6.QtWidgets import QApplication, QMainWindow
from subprocess import CREATE_NO_WINDOW
import subprocess
import os
import sys
import threading
import importlib
import time

def ensure_dependencies():
    required_packages = ['PySide6', 'pywebview', 'flask', 'flask-socketio']
    for package in required_packages:
        try:
            importlib.import_module(package.lower().replace('-', '_'))
        except ImportError:
            print(f"Installing {package}...")
            subprocess.check_call([sys.executable, "-m", "pip", "install", package])
            ensure_dependencies()
try:
    import webview
except ImportError:
    pass

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app)

current_process = None
process_lock = threading.Lock()

def resource_path(relative_path):
    if hasattr(sys, '_MEIPASS'):
        return os.path.join(sys._MEIPASS, relative_path)
    return os.path.join(os.path.abspath("."), relative_path)

app.template_folder = resource_path('templates')

@app.route('/')
def index():
    return render_template('index.html')

def read_output(process):
    try:
        for c in iter(lambda: process.stdout.read(1), ''):
            socketio.emit('term_output', {'data': c})
    except Exception as e:
        pass
    finally:
        if process.stdout:
            process.stdout.close()
        socketio.emit('term_stop', {'data': '\n[Process Finished]'})

def run_sql_script(code, script_path):
    py_sql_runner = f"""
import sqlite3
import sys

try:
    con = sqlite3.connect(":memory:")
    cur = con.cursor()
    script = \"\"\"{code}\"\"\"
    cur.executescript(script)
    for row in cur.fetchall():
        print(row)
    # ถ้า user ใช้ SELECT แต่ไม่ใช่ script
    if "SELECT" in script.upper():
        pass 
except Exception as e:
    print(f"SQL Error: {{e}}")
finally:
    con.close()
"""
    with open(script_path, "w", encoding="utf-8") as f:
        f.write(py_sql_runner)
    return ['python', '-u', script_path]

@socketio.on('run_code')
def handle_run_code(data):
    global current_process
    code = data.get('code')
    lang = data.get('language')
    
    filename = "temp_script"
    run_cmd = []
    
    temp_dir = resource_path("temp_build")
    if not os.path.exists(temp_dir):
        os.makedirs(temp_dir)

    try:
        if lang == 'python':
            path = os.path.join(temp_dir, 'script.py')
            with open(path, "w", encoding="utf-8") as f: f.write(code)
            run_cmd = ['python', '-u', path]

        elif lang == 'javascript':
            path = os.path.join(temp_dir, 'script.js')
            with open(path, "w", encoding="utf-8") as f: f.write(code)
            run_cmd = ['node', path]
        
        elif lang == 'lua':
            path = os.path.join(temp_dir, 'script.lua')
            with open(path, "w", encoding="utf-8") as f: f.write(code)
            run_cmd = ['lua', path]

        elif lang == 'sql':
            path = os.path.join(temp_dir, 'sql_runner.py')
            run_cmd = run_sql_script(code, path)

        elif lang == 'cpp':
            src = os.path.join(temp_dir, 'main.cpp')
            exe = os.path.join(temp_dir, 'main.exe')
            with open(src, "w", encoding="utf-8") as f: f.write(code)
            
            compile_res = subprocess.run(['g++', src, '-o', exe], capture_output=True, text=True)
            if compile_res.returncode != 0:
                socketio.emit('term_output', {'data': f"Compilation Error:\n{compile_res.stderr}"})
                socketio.emit('term_stop', {'data': ''})
                return
            run_cmd = [exe]

        elif lang == 'csharp':
            src = os.path.join(temp_dir, 'Program.cs')
            exe = os.path.join(temp_dir, 'Program.exe')
            with open(src, "w", encoding="utf-8") as f: f.write(code)
            
            compile_res = subprocess.run(['csc', f'/out:{exe}', src], capture_output=True, text=True)
            if compile_res.returncode != 0:
                socketio.emit('term_output', {'data': f"Compilation Error:\n{compile_res.stdout}"})
                socketio.emit('term_stop', {'data': ''})
                return
            run_cmd = [exe]

        elif lang == 'java':
            src = os.path.join(temp_dir, 'Main.java')
            with open(src, "w", encoding="utf-8") as f: f.write(code)
            
            compile_res = subprocess.run(['javac', src], capture_output=True, text=True)
            if compile_res.returncode != 0:
                socketio.emit('term_output', {'data': f"Compilation Error:\n{compile_res.stderr}"})
                socketio.emit('term_stop', {'data': ''})
                return
            run_cmd = ['java', '-cp', temp_dir, 'Main']

        elif lang == 'go':
            src = os.path.join(temp_dir, 'main.go')
            with open(src, "w", encoding="utf-8") as f: f.write(code)
            run_cmd = ['go', 'run', src]

        elif lang == 'rust':
            src = os.path.join(temp_dir, 'main.rs')
            exe = os.path.join(temp_dir, 'main.exe')
            with open(src, "w", encoding="utf-8") as f: f.write(code)
            
            compile_res = subprocess.run(['rustc', src, '-o', exe], capture_output=True, text=True)
            if compile_res.returncode != 0:
                socketio.emit('term_output', {'data': f"Compilation Error:\n{compile_res.stderr}"})
                socketio.emit('term_stop', {'data': ''})
                return
            run_cmd = [exe]
            
        elif lang == 'zig':
            src = os.path.join(temp_dir, 'main.zig')
            with open(src, "w", encoding="utf-8") as f: f.write(code)
            run_cmd = ['zig', 'run', src]
            
        elif lang == 'scala':
            src = os.path.join(temp_dir, 'Main.scala')
            with open(src, "w", encoding="utf-8") as f: f.write(code)
            run_cmd = ['scala', src]

        else:
            socketio.emit('term_output', {'data': f"Language {lang} not supported yet."})
            return

    except Exception as e:
        socketio.emit('term_output', {'data': f"Setup Error: {str(e)}"})
        return

    startupinfo = None
    if os.name == 'nt':
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startupinfo.dwFlags |= subprocess.SW_HIDE
        startupinfo.creationflags = subprocess.CREATE_NO_WINDOW

    try:
        with process_lock:
            if current_process and current_process.poll() is None:
                current_process.kill()

            current_process = subprocess.Popen(
                run_cmd, 
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
                startupinfo=startupinfo
            )
        
        t = threading.Thread(target=read_output, args=(current_process,))
        t.daemon = True
        t.start()
        
    except FileNotFoundError:
        socketio.emit('term_output', {'data': f"Error: Command not found. Please make sure compiler for '{lang}' is installed and in PATH."})
        socketio.emit('term_stop', {'data': ''})
    except Exception as e:
        socketio.emit('term_output', {'data': f"Execution Error: {str(e)}"})

@socketio.on('send_input')
def handle_input(data):
    global current_process
    user_input = data.get('input')
    
    with process_lock:
        if current_process and current_process.poll() is None:
            try:
                current_process.stdin.write(user_input + "\n")
                current_process.stdin.flush()
            except Exception as e:
                print(f"Input Error: {e}")

def start_server():
    socketio.run(app, port=5000, debug=False, allow_unsafe_werkzeug=True)

if __name__ == '__main__':
    t = threading.Thread(target=start_server)
    t.daemon = True
    t.start()
    time.sleep(1)
    
    try:
        webview.create_window('Neofilisoft Open Compiler', 'http://127.0.0.1:5000', width=1100, height=800, background_color='#1e1e1e')
        webview.start()
    except ImportError:
        import webbrowser
        webbrowser.open('http://127.0.0.1:5000')
        while True: time.sleep(1)
