# font-size

โฟลเดอร์นี้รวมทุกอย่างที่เกี่ยวกับฟอนต์และขนาดฟอนต์ของ NVECode

สิ่งที่อยู่ในโฟลเดอร์นี้:
- `Inter.ttc`
- `InterVariable.ttf`
- `InterVariable-Italic.ttf`
- `font-size-defaults.json` สำหรับค่าตั้งต้นของ UI/editor/terminal
- `font-size-manager.js` สำหรับสร้าง `@font-face` CSS และ resolve path ของฟอนต์ตอนรันจริง

แนวคิดการใช้งาน:
- `Inter` เป็น default font ของ NVECode
- end-user ยังสามารถเปลี่ยน `editor.fontFamily`, `editor.fontSize`, `terminal.integrated.fontFamily`, `terminal.integrated.fontSize` และ theme ได้เองผ่าน Settings
- build/dev flow จะคัดลอกโฟลเดอร์นี้เข้า `vscode-source/font-size` เพื่อให้ตัวแอปที่ถูกแพ็กยังหา font asset เจอ
