#include <fstream>
#include <iostream>
#include <sstream>
#include <string>

#include "core/ide_core.hpp"

int main(int argc, char** argv) {
    noc::core::IdeCore core;

    if (argc == 2 && std::string(argv[1]) == "--languages") {
        for (const auto& language : core.languages()) {
            std::cout << language.id << " - " << language.display_name << std::endl;
        }
        return 0;
    }

    if (argc < 3) {
        std::cerr << "Usage: nocompiler-cli <language> <source-file>" << std::endl;
        std::cerr << "   or: nocompiler-cli --languages" << std::endl;
        return 1;
    }

    std::ifstream input(argv[2], std::ios::binary);
    if (!input) {
        std::cerr << "Unable to open source file." << std::endl;
        return 1;
    }

    std::ostringstream buffer;
    buffer << input.rdbuf();

    noc::core::ExecutionRequest request;
    request.language = argv[1];
    request.code = buffer.str();
    request.session_id = "cli_run";

    const auto result = core.run(std::move(request));
    if (!result.output.empty()) {
        std::cout << result.output;
    }
    if (!result.error.empty()) {
        std::cerr << result.error << std::endl;
    }
    return result.success ? 0 : 1;
}
