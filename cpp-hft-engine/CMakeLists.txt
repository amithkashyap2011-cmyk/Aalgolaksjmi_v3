cmake_minimum_required(VERSION 3.17)
project(AalgoHftEngine CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Optimization Flags for Ultra-Low Latency Execution
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -O3 -march=native -mtune=native -pthread")

# Find ZeroMQ via pkg-config (Native for macOS Homebrew)
find_package(PkgConfig REQUIRED)
pkg_check_modules(ZMQ REQUIRED libzmq)

include_directories(${CMAKE_SOURCE_DIR}/include)
include_directories(${ZMQ_INCLUDE_DIRS})
include_directories(/opt/homebrew/include)
link_directories(${ZMQ_LIBRARY_DIRS})
link_directories(/opt/homebrew/lib)

add_executable(hft_engine src/main.cpp)

target_link_libraries(hft_engine ${ZMQ_LIBRARIES} pthread)
