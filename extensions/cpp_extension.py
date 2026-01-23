"""
C/C++ Extension
Provides C/C++ specific features
"""
from extensions_manager import BaseExtension
import re

class CppExtension(BaseExtension):
    def __init__(self):
        super().__init__()
        self.version = "1.0.0"
        self.description = "C/C++ language support"
    
    def get_info(self):
        return {
            'name': 'C/C++ Extension',
            'version': self.version,
            'description': self.description,
            'languages': ['cpp', 'c']
        }
    
    def on_code_change(self, code, language):
        """Called when C/C++ code changes"""
        if language not in ['cpp', 'c']:
            return
        
        # Can add real-time analysis here
        pass
    
    def get_diagnostics(self, code, language):
        """Get C/C++ specific diagnostics"""
        if language not in ['cpp', 'c']:
            return []
        
        diagnostics = []
        
        # Check for common issues
        lines = code.split('\n')
        
        for i, line in enumerate(lines):
            line_num = i + 1
            
            # Check for missing semicolons (basic check)
            if re.search(r'(int|float|double|char|bool)\s+\w+\s*=.*[^;{]\s*$', line.strip()):
                diagnostics.append({
                    'line': line_num,
                    'column': len(line),
                    'severity': 'error',
                    'message': 'Missing semicolon'
                })
            
            # Check for using namespace in headers
            if '#include' in line and 'using namespace' in code:
                if 'using namespace std' in code:
                    diagnostics.append({
                        'line': line_num,
                        'column': 1,
                        'severity': 'warning',
                        'message': 'Avoid "using namespace std" in header files'
                    })
        
        return diagnostics
    
    def format_code(self, code):
        """Format C/C++ code (basic formatting)"""
        # This is a placeholder - real implementation would use clang-format
        return code
    
    def get_compile_flags(self, standard='c++17'):
        """Get recommended compile flags"""
        return [
            f'-std={standard}',
            '-Wall',
            '-Wextra',
            '-O2'
        ]