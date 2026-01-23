"""
C# Dev Kit Extension
Provides C# specific features
"""
from extensions_manager import BaseExtension
import re

class CsharpExtension(BaseExtension):
    def __init__(self):
        super().__init__()
        self.version = "1.0.0"
        self.description = "C# development tools"
    
    def get_info(self):
        return {
            'name': 'C# Dev Kit',
            'version': self.version,
            'description': self.description,
            'languages': ['csharp']
        }
    
    def on_code_change(self, code, language):
        """Called when C# code changes"""
        if language != 'csharp':
            return
        pass
    
    def get_diagnostics(self, code, language):
        """Get C# specific diagnostics"""
        if language != 'csharp':
            return []
        
        diagnostics = []
        lines = code.split('\n')
        
        for i, line in enumerate(lines):
            line_num = i + 1
            
            # Check for missing semicolons
            stripped = line.strip()
            if stripped and not stripped.endswith((';', '{', '}', '//')):
                if any(keyword in stripped for keyword in ['int', 'string', 'var', 'return', 'Console']):
                    if '(' not in stripped or ')' in stripped:
                        diagnostics.append({
                            'line': line_num,
                            'column': len(line),
                            'severity': 'error',
                            'message': 'Possible missing semicolon'
                        })
            
            # Check naming conventions
            class_match = re.search(r'class\s+([a-z]\w+)', line)
            if class_match:
                diagnostics.append({
                    'line': line_num,
                    'column': line.index(class_match.group(1)),
                    'severity': 'warning',
                    'message': f'Class name "{class_match.group(1)}" should start with uppercase (PascalCase)'
                })
        
        return diagnostics
    
    def get_project_templates(self):
        """Get C# project templates"""
        return {
            'console': 'Console Application',
            'library': 'Class Library',
            'web': 'ASP.NET Web Application',
            'wpf': 'WPF Application'
        }
    
    def create_project_structure(self, project_type):
        """Create C# project structure"""
        templates = {
            'console': '''using System;

namespace MyApplication
{
    class Program
    {
        static void Main(string[] args)
        {
            Console.WriteLine("Hello World!");
        }
    }
}''',
            'library': '''using System;

namespace MyLibrary
{
    public class MyClass
    {
        public void MyMethod()
        {
            // Your code here
        }
    }
}'''
        }
        return templates.get(project_type, templates['console'])