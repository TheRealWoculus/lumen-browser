cmake_minimum_required(VERSION 3.20)
project(Lumen VERSION 1.0.0 LANGUAGES CXX C)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

option(LUMEN_SANDBOX     "Enable process sandbox"        ON)
option(LUMEN_GPU         "Enable GPU acceleration"       ON)
option(LUMEN_EXTENSIONS  "Enable Chrome Extension API"   ON)
option(LUMEN_ADBLOCKER   "Enable built-in ad blocker"    ON)
option(LUMEN_READER      "Enable Reader Mode"            ON)
option(LUMEN_PIP         "Enable Picture-in-Picture"     ON)
option(LUMEN_TRANSLATE   "Enable translation"            ON)
option(LUMEN_SYNC        "Enable optional E2EE sync"     ON)
option(LUMEN_LTO         "Enable Link-Time Optimization" ON)

if(MSVC)
  add_compile_options(/W4 /MP /O2 /Ob2 /Oi /Ot /GS /Gy)
  if(LUMEN_LTO)
    add_compile_options(/GL)
    add_link_options(/LTCG /OPT:REF /OPT:ICF /INCREMENTAL:NO)
  endif()
  add_compile_definitions(WIN32_LEAN_AND_MEAN NOMINMAX UNICODE _UNICODE _CRT_SECURE_NO_WARNINGS)
else()
  add_compile_options(-Wall -Wextra -O3 -march=native -fvisibility=hidden)
  add_link_options(-Wl,--gc-sections)
  if(LUMEN_LTO)
    add_compile_options(-flto=thin)
    add_link_options(-flto=thin)
  endif()
endif()

if(LUMEN_SANDBOX)    add_compile_definitions(LUMEN_FEATURE_SANDBOX)    endif()
if(LUMEN_GPU)        add_compile_definitions(LUMEN_FEATURE_GPU)        endif()
if(LUMEN_EXTENSIONS) add_compile_definitions(LUMEN_FEATURE_EXTENSIONS) endif()
if(LUMEN_ADBLOCKER)  add_compile_definitions(LUMEN_FEATURE_ADBLOCKER)  endif()
if(LUMEN_READER)     add_compile_definitions(LUMEN_FEATURE_READER)     endif()
if(LUMEN_PIP)        add_compile_definitions(LUMEN_FEATURE_PIP)        endif()
if(LUMEN_TRANSLATE)  add_compile_definitions(LUMEN_FEATURE_TRANSLATE)  endif()
if(LUMEN_SYNC)       add_compile_definitions(LUMEN_FEATURE_SYNC)       endif()

find_package(Qt6 REQUIRED COMPONENTS
  Core Widgets WebEngineWidgets WebEngineCore WebChannel
  Network NetworkAuth OpenGL Svg Multimedia MultimediaWidgets
  Concurrent Sql DBus)
find_package(nlohmann_json REQUIRED)
find_package(spdlog        REQUIRED)
find_package(leveldb       REQUIRED)
find_package(OpenSSL       REQUIRED)
find_package(ZLIB          REQUIRED)

file(GLOB_RECURSE ALL_SRC "src/**/*.cpp" "src/**/*.h")
if(WIN32)
  list(APPEND ALL_SRC assets/lumen.rc)
endif()

qt_add_executable(Lumen WIN32 MACOSX_BUNDLE src/main.cpp ${ALL_SRC} assets/lumen.qrc)

qt_add_resources(Lumen "res" PREFIX "/" FILES
  assets/themes/dark.qss
  assets/themes/light.qss
  assets/icons/lumen.png
  assets/icons/lumen_32.png
  assets/icons/lumen_256.png)

target_include_directories(Lumen PRIVATE src/)
target_link_libraries(Lumen PRIVATE
  Qt6::Core Qt6::Widgets Qt6::WebEngineWidgets Qt6::WebEngineCore
  Qt6::WebChannel Qt6::Network Qt6::NetworkAuth Qt6::OpenGL
  Qt6::Svg Qt6::Multimedia Qt6::MultimediaWidgets
  Qt6::Concurrent Qt6::Sql
  nlohmann_json::nlohmann_json spdlog::spdlog leveldb::leveldb
  OpenSSL::SSL OpenSSL::Crypto ZLIB::ZLIB)

install(TARGETS Lumen RUNTIME DESTINATION bin)
install(DIRECTORY assets/themes/ DESTINATION share/lumen/themes)
