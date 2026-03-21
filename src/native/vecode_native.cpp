// src/native/vecode_native.cpp  (v1.0.2)
// NVECode native N-API addon - sysinfo, fast FS, process runner, compiler finder, zox bridge
#include <napi.h>
#include <string>
#include <vector>
#include <fstream>
#include <filesystem>
#include <chrono>
#ifdef _WIN32
  #define WIN32_LEAN_AND_MEAN
  #include <windows.h>
  #include <psapi.h>
  #pragma comment(lib,"psapi.lib")
#elif defined(__APPLE__)
  #include <sys/sysctl.h>
  #include <mach/mach.h>
  #include <unistd.h>
#else
  #include <unistd.h>
  #include <sys/sysinfo.h>
#endif
namespace fs = std::filesystem;
using Clock  = std::chrono::steady_clock;

// Forward-declare zox bridge functions (vecode_native_unzox.cpp)
void RegisterUnzox(Napi::Env, Napi::Object);

Napi::Object GetSystemInfo(const Napi::CallbackInfo& info){
    auto env=info.Env(); auto r=Napi::Object::New(env);
#ifdef _WIN32
    r.Set("platform",Napi::String::New(env,"win32"));
    SYSTEM_INFO si{}; GetNativeSystemInfo(&si);
    r.Set("cpuCount",Napi::Number::New(env,(double)si.dwNumberOfProcessors));
    r.Set("arch",Napi::String::New(env,si.wProcessorArchitecture==PROCESSOR_ARCHITECTURE_AMD64?"x64":si.wProcessorArchitecture==PROCESSOR_ARCHITECTURE_ARM64?"arm64":"x86"));
    MEMORYSTATUSEX m{}; m.dwLength=sizeof(m); GlobalMemoryStatusEx(&m);
    r.Set("totalMemMB",Napi::Number::New(env,(double)(m.ullTotalPhys>>20)));
    r.Set("freeMemMB", Napi::Number::New(env,(double)(m.ullAvailPhys>>20)));
#elif defined(__APPLE__)
    r.Set("platform",Napi::String::New(env,"darwin"));
    int cpus=0; size_t sz=sizeof(cpus); sysctlbyname("hw.logicalcpu",&cpus,&sz,nullptr,0);
    r.Set("cpuCount",Napi::Number::New(env,cpus));
    r.Set("arch",Napi::String::New(env,sizeof(void*)==8?"x64":"x86"));
    int64_t tot=0; sz=sizeof(tot); sysctlbyname("hw.memsize",&tot,&sz,nullptr,0);
    r.Set("totalMemMB",Napi::Number::New(env,(double)(tot>>20)));
    vm_statistics64_data_t vms{}; mach_msg_type_number_t cnt=HOST_VM_INFO64_COUNT;
    vm_size_t ps; host_page_size(mach_host_self(),&ps);
    host_statistics64(mach_host_self(),HOST_VM_INFO64,(host_info64_t)&vms,&cnt);
    r.Set("freeMemMB",Napi::Number::New(env,(double)((uint64_t)vms.free_count*ps>>20)));
#else
    r.Set("platform",Napi::String::New(env,"linux"));
    r.Set("cpuCount",Napi::Number::New(env,(double)sysconf(_SC_NPROCESSORS_ONLN)));
    r.Set("arch",Napi::String::New(env,sizeof(void*)==8?"x64":"x86"));
    struct sysinfo si{}; sysinfo(&si);
    r.Set("totalMemMB",Napi::Number::New(env,(double)(si.totalram*si.mem_unit>>20)));
    r.Set("freeMemMB", Napi::Number::New(env,(double)(si.freeram *si.mem_unit>>20)));
#endif
    return r;
}
Napi::Object FastStat(const Napi::CallbackInfo& info){
    auto env=info.Env(); auto r=Napi::Object::New(env);
    if(info.Length()<1||!info[0].IsString()){Napi::TypeError::New(env,"fastStat(path)").ThrowAsJavaScriptException();return r;}
    auto p=info[0].As<Napi::String>().Utf8Value();
    std::error_code ec; auto st=fs::status(p,ec);
    if(ec){r.Set("exists",Napi::Boolean::New(env,false));return r;}
    r.Set("exists",Napi::Boolean::New(env,true));
    r.Set("isFile",Napi::Boolean::New(env,fs::is_regular_file(st)));
    r.Set("isDir", Napi::Boolean::New(env,fs::is_directory(st)));
    if(fs::is_regular_file(st)){auto sz=fs::file_size(p,ec);r.Set("size",Napi::Number::New(env,ec?0.0:(double)sz));}
    else r.Set("size",Napi::Number::New(env,0.0));
    auto lwt=fs::last_write_time(p,ec);
    if(!ec){auto ms=std::chrono::duration_cast<std::chrono::milliseconds>(lwt.time_since_epoch()).count();r.Set("mtimeMs",Napi::Number::New(env,(double)ms));}
    return r;
}
Napi::Array ReadDir(const Napi::CallbackInfo& info){
    auto env=info.Env();
    if(info.Length()<1||!info[0].IsString()){Napi::TypeError::New(env,"readDir(path)").ThrowAsJavaScriptException();return Napi::Array::New(env);}
    auto p=info[0].As<Napi::String>().Utf8Value();
    std::error_code ec; std::vector<Napi::Object> v;
    for(const auto& e:fs::directory_iterator(p,ec)){if(ec)break;auto o=Napi::Object::New(env);bool d=e.is_directory(ec);o.Set("name",Napi::String::New(env,e.path().filename().string()));o.Set("isDir",Napi::Boolean::New(env,d));o.Set("size",Napi::Number::New(env,(!d&&e.is_regular_file(ec))?(double)e.file_size(ec):0.0));v.push_back(o);}
    auto a=Napi::Array::New(env,v.size()); for(size_t i=0;i<v.size();++i)a.Set((uint32_t)i,v[i]); return a;
}
Napi::Value ReadFileBuffer(const Napi::CallbackInfo& info){
    auto env=info.Env();
    if(info.Length()<1||!info[0].IsString()){Napi::TypeError::New(env,"readFileBuffer(path)").ThrowAsJavaScriptException();return env.Null();}
    auto p=info[0].As<Napi::String>().Utf8Value();
    std::ifstream f(p,std::ios::binary|std::ios::ate);
    if(!f){Napi::Error::New(env,"Cannot open: "+p).ThrowAsJavaScriptException();return env.Null();}
    std::streamsize sz=f.tellg(); f.seekg(0);
    auto buf=Napi::Buffer<uint8_t>::New(env,(size_t)sz);
    if(!f.read(reinterpret_cast<char*>(buf.Data()),sz)){Napi::Error::New(env,"Read error: "+p).ThrowAsJavaScriptException();return env.Null();}
    return buf;
}
static std::string execCapture(const std::string& cmd,int& ec){
    std::string out; ec=-1;
#ifdef _WIN32
    HANDLE hr,hw; SECURITY_ATTRIBUTES sa{sizeof(sa),nullptr,TRUE};
    if(!CreatePipe(&hr,&hw,&sa,0))return "";
    SetHandleInformation(hr,HANDLE_FLAG_INHERIT,0);
    STARTUPINFOA si{}; si.cb=sizeof(si); si.dwFlags=STARTF_USESTDHANDLES; si.hStdOutput=hw; si.hStdError=hw; si.hStdInput=INVALID_HANDLE_VALUE;
    PROCESS_INFORMATION pi{}; std::string mc=cmd;
    if(CreateProcessA(nullptr,mc.data(),nullptr,nullptr,TRUE,CREATE_NO_WINDOW,nullptr,nullptr,&si,&pi)){CloseHandle(hw);char buf[4096];DWORD rd;while(ReadFile(hr,buf,sizeof(buf)-1,&rd,nullptr)&&rd){buf[rd]=0;out+=buf;}WaitForSingleObject(pi.hProcess,INFINITE);DWORD e2;GetExitCodeProcess(pi.hProcess,&e2);ec=(int)e2;CloseHandle(pi.hProcess);CloseHandle(pi.hThread);}else CloseHandle(hw);CloseHandle(hr);
#else
    FILE* p=popen(cmd.c_str(),"r"); if(!p)return ""; char buf[4096]; while(fgets(buf,sizeof(buf),p))out+=buf; ec=pclose(p)>>8;
#endif
    return out;
}
Napi::Object RunProcess(const Napi::CallbackInfo& info){
    auto env=info.Env(); auto r=Napi::Object::New(env);
    if(info.Length()<1||!info[0].IsString()){Napi::TypeError::New(env,"runProcess(cmd,args?,cwd?)").ThrowAsJavaScriptException();return r;}
    std::string cmd=info[0].As<Napi::String>().Utf8Value();
    if(info.Length()>=2&&info[1].IsArray()){auto args=info[1].As<Napi::Array>();for(uint32_t i=0;i<args.Length();++i){auto a=args.Get(i).As<Napi::String>().Utf8Value();cmd+=(a.find(' ')!=std::string::npos)?(" \""+a+"\""):(" "+a);}}
    if(info.Length()>=3&&info[2].IsString()){auto cwd=info[2].As<Napi::String>().Utf8Value();
#ifdef _WIN32
        cmd="cd /d \""+cwd+"\" && "+cmd;
#else
        cmd="cd \""+cwd+"\" && "+cmd;
#endif
    }
    auto t0=Clock::now(); int ec=0; auto out=execCapture(cmd,ec);
    auto ms=std::chrono::duration_cast<std::chrono::milliseconds>(Clock::now()-t0).count();
    r.Set("stdout",Napi::String::New(env,out)); r.Set("stderr",Napi::String::New(env,""));
    r.Set("exitCode",Napi::Number::New(env,ec)); r.Set("durationMs",Napi::Number::New(env,(double)ms));
    return r;
}
static std::string tryExec(const std::string& cmd){int ec=0;auto o=execCapture(cmd,ec);if(ec)return "";while(!o.empty()&&(o.back()=='\n'||o.back()=='\r'||o.back()==' '))o.pop_back();return o;}
static bool cmdExists(const std::string& e){int ec=0;
#ifdef _WIN32
    execCapture("where "+e+" >nul 2>&1",ec);
#else
    execCapture("command -v "+e+" >/dev/null 2>&1",ec);
#endif
    return ec==0;}
Napi::Object FindCompiler(const Napi::CallbackInfo& info){
    auto env=info.Env(); auto r=Napi::Object::New(env);
    std::string lang="cpp";
    if(info.Length()>=1&&info[0].IsString())lang=info[0].As<Napi::String>().Utf8Value();
    struct C{std::string cc,cxx,flag;};
#ifdef _WIN32
    std::vector<C> cands={{"cl","cl","/?"},{"gcc","g++","--version"},{"clang","clang++","--version"}};
#elif defined(__APPLE__)
    std::vector<C> cands={{"clang","clang++","--version"},{"gcc-13","g++-13","--version"},{"gcc","g++","--version"}};
#else
    std::vector<C> cands={{"gcc","g++","--version"},{"gcc-13","g++-13","--version"},{"gcc-12","g++-12","--version"},{"clang","clang++","--version"},{"cc","c++","--version"}};
#endif
    for(const auto& c:cands){bool found=cmdExists(lang=="c"?c.cc:c.cxx);if(!found&&lang!="c")found=cmdExists(c.cc);if(!found)continue;
        std::string exe=(lang!="c"&&cmdExists(c.cxx))?c.cxx:c.cc;
        auto ver=tryExec(exe+" "+c.flag+" 2>&1"); auto nl=ver.find('\n');
        r.Set("cc",Napi::String::New(env,c.cc)); r.Set("cxx",Napi::String::New(env,c.cxx));
        r.Set("version",Napi::String::New(env,nl!=std::string::npos?ver.substr(0,nl):ver));
        r.Set("found",Napi::Boolean::New(env,true)); return r;}
    r.Set("cc",Napi::String::New(env,"")); r.Set("cxx",Napi::String::New(env,""));
    r.Set("version",Napi::String::New(env,"")); r.Set("found",Napi::Boolean::New(env,false)); return r;
}
Napi::Object Init(Napi::Env env, Napi::Object exports){
    exports.Set("getSystemInfo",  Napi::Function::New(env,GetSystemInfo));
    exports.Set("fastStat",       Napi::Function::New(env,FastStat));
    exports.Set("readDir",        Napi::Function::New(env,ReadDir));
    exports.Set("readFileBuffer", Napi::Function::New(env,ReadFileBuffer));
    exports.Set("runProcess",     Napi::Function::New(env,RunProcess));
    exports.Set("findCompiler",   Napi::Function::New(env,FindCompiler));
    RegisterUnzox(env, exports);
    return exports;
}
NODE_API_MODULE(vecode_native, Init)


