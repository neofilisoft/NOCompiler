{
  "targets": [{
    "target_name": "vecode_native",
    "sources": [
      "src/native/vecode_native.cpp",
      "src/native/vecode_native_unzox.cpp"
    ],
    "include_dirs": [
      "<!@(node -p \"require('node-addon-api').include\")"
    ],
    "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
    "conditions": [
      ["OS=='win'", {
        "msvs_settings": {"VCCLCompilerTool": {"AdditionalOptions": ["/std:c++20", "/W3", "/O2"]}},
        "libraries": ["-lpsapi"]
      }],
      ["OS=='mac'", {
        "xcode_settings": {"GCC_ENABLE_CPP_EXCEPTIONS":"YES","CLANG_CXX_LANGUAGE_STANDARD":"c++20","MACOSX_DEPLOYMENT_TARGET":"11.0"}
      }],
      ["OS=='linux'", {
        "cflags_cc": ["-std=c++20","-O2","-Wall"],
        "ldflags": ["-Wl,--allow-shlib-undefined"]
      }]
    ]
  }]
}
