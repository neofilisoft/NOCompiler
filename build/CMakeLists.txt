cmake_minimum_required(VERSION 3.20)
project(VecodeNative VERSION 1.0.1 LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
if(POLICY CMP0042)
  cmake_policy(SET CMP0042 NEW)
endif()

find_program(NODE_EXECUTABLE node REQUIRED)
execute_process(COMMAND ${NODE_EXECUTABLE} -p "require('node-addon-api').include.replace(/'/g,'')"
    OUTPUT_VARIABLE NAPI_INCLUDE OUTPUT_STRIP_TRAILING_WHITESPACE WORKING_DIRECTORY ${CMAKE_SOURCE_DIR})
execute_process(COMMAND ${NODE_EXECUTABLE} -p "require('path').join(process.execPath,'..','..','include','node')"
    OUTPUT_VARIABLE NODE_INCLUDE OUTPUT_STRIP_TRAILING_WHITESPACE)

add_library(vecode_native SHARED
    ../src/native/vecode_native.cpp
    ../src/native/vecode_native_unzox.cpp
)
set_target_properties(vecode_native PROPERTIES PREFIX "" SUFFIX ".node" OUTPUT_NAME "vecode_native")
target_include_directories(vecode_native PRIVATE ${NAPI_INCLUDE} ${NODE_INCLUDE})
target_compile_definitions(vecode_native PRIVATE NAPI_DISABLE_CPP_EXCEPTIONS BUILDING_NODE_EXTENSION)

if(MSVC)
    target_compile_options(vecode_native PRIVATE /W3 /O2 /std:c++20)
    target_link_libraries(vecode_native PRIVATE psapi)
elseif(APPLE)
    target_compile_options(vecode_native PRIVATE -Wall -O2)
    set_target_properties(vecode_native PROPERTIES LINK_FLAGS "-undefined dynamic_lookup")
else()
    target_compile_options(vecode_native PRIVATE -Wall -O2)
    set_target_properties(vecode_native PROPERTIES LINK_FLAGS "-Wl,--allow-shlib-undefined")
endif()

install(TARGETS vecode_native DESTINATION "${CMAKE_SOURCE_DIR}/../build/Release")
add_custom_target(deploy
    COMMAND ${CMAKE_COMMAND} --build ${CMAKE_BINARY_DIR} --config Release
    COMMAND ${CMAKE_COMMAND} --install ${CMAKE_BINARY_DIR} --config Release
    COMMENT "Build + deploy" VERBATIM)

message(STATUS "VecodeNative v1.0.1 | Compiler: ${CMAKE_CXX_COMPILER_ID}")
