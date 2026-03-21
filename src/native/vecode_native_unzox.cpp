// src/native/vecode_native_unzox.cpp
// NVECode - lightweight zox bridge for zip-compatible .zox archives
#include <napi.h>
#include <array>
#include <fstream>
#include <string>

static Napi::Object MakeResult(Napi::Env env, bool ok, const std::string& message = "") {
    auto result = Napi::Object::New(env);
    result.Set("ok", Napi::Boolean::New(env, ok));
    if (!message.empty()) {
        result.Set("error", Napi::String::New(env, message));
    }
    return result;
}

static bool IsZipCompatible(const std::string& path) {
    std::ifstream stream(path, std::ios::binary);
    if (!stream) return false;
    std::array<unsigned char, 4> magic{};
    stream.read(reinterpret_cast<char*>(magic.data()), static_cast<std::streamsize>(magic.size()));
    return stream.gcount() >= 4 && magic[0] == 'P' && magic[1] == 'K';
}

Napi::Value UnzoxVersion(const Napi::CallbackInfo& info) {
    return Napi::String::New(info.Env(), "zip-compatible-zox-bridge");
}

Napi::Value UnzoxProbe(const Napi::CallbackInfo& info) {
    auto env = info.Env();
    if (info.Length() < 1 || !info[0].IsString()) {
        return MakeResult(env, false, "archivePath: string required");
    }

    const auto archivePath = info[0].As<Napi::String>().Utf8Value();
    if (!IsZipCompatible(archivePath)) {
        return MakeResult(env, false, "This build only supports zip-compatible .zox archives");
    }

    auto result = Napi::Object::New(env);
    result.Set("ok", Napi::Boolean::New(env, true));
    result.Set("zipCompatible", Napi::Boolean::New(env, true));
    result.Set("encrypted", Napi::Boolean::New(env, false));
    result.Set("solid", Napi::Boolean::New(env, false));
    result.Set("entryCount", Napi::Number::New(env, 0));
    result.Set("entries", Napi::Array::New(env));
    return result;
}

Napi::Value UnzoxExtract(const Napi::CallbackInfo& info) {
    auto env = info.Env();
    if (info.Length() < 2 || !info[0].IsString() || !info[1].IsString()) {
        return MakeResult(env, false, "args: (archivePath: string, destDir: string, password?: string)");
    }

    const auto archivePath = info[0].As<Napi::String>().Utf8Value();
    if (!IsZipCompatible(archivePath)) {
        return MakeResult(env, false, "Native extraction is unavailable for non-zip-compatible .zox archives in this build");
    }

    return MakeResult(env, false, "Zip-compatible .zox extraction is handled in the JS extension manager layer");
}

Napi::Value UnzoxReadEntry(const Napi::CallbackInfo& info) {
    Napi::Error::New(info.Env(), "Entry reads are unavailable in the lightweight zox bridge").ThrowAsJavaScriptException();
    return info.Env().Null();
}

void RegisterUnzox(Napi::Env env, Napi::Object exports) {
    exports.Set("unzoxVersion", Napi::Function::New(env, UnzoxVersion));
    exports.Set("unzoxProbe", Napi::Function::New(env, UnzoxProbe));
    exports.Set("unzoxExtract", Napi::Function::New(env, UnzoxExtract));
    exports.Set("unzoxReadEntry", Napi::Function::New(env, UnzoxReadEntry));
}
