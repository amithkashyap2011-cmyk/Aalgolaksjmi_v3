#include <iostream>
#include <thread>
#include <string>
#include <chrono>
#include <zmq.hpp> // Requires libzmq and cppzmq
#include <arpa/inet.h>
#include <pthread.h>
#include <sched.h>

// Internal TradeSignal definition parsed via ZeroMQ IPC
struct TradeSignal {
    std::string symbol;
    std::string side;
    double qty;
};

// --------------------------------------------------------- //
// MOCK CLASSES (for starter scaffold)
// --------------------------------------------------------- //

// Simple lock-free abstraction scaffold
template <typename T>
class MpmcQueue {
public:
    MpmcQueue(size_t size) {}
    bool push(const T& item) { return true; }
    bool pop(T& item) { return false; }
};

class ExecutionEngine {
public:
    ExecutionEngine() = default;

    inline bool preTradeRiskCheck(const TradeSignal& signal) const {
        if (signal.qty > 1000000.0) return false;
        return true; 
    }

    inline void executeOrder(const TradeSignal& signal) {
        std::cout << "[OEE] Executing: " << signal.symbol << " " << signal.side << " " << signal.qty << std::endl;
    }
};

static TradeSignal parseZeroMQPayload(const zmq::message_t& msg) {
    std::string payload(static_cast<const char*>(msg.data()), msg.size());
    TradeSignal signal;
    size_t first_pipe = payload.find('|');
    size_t second_pipe = payload.find('|', first_pipe + 1);
    
    if (first_pipe != std::string::npos && second_pipe != std::string::npos) {
        signal.symbol = payload.substr(0, first_pipe);
        signal.side = payload.substr(first_pipe + 1, second_pipe - first_pipe - 1);
        signal.qty = std::stod(payload.substr(second_pipe + 1));
    }
    return signal;
}

// --------------------------------------------------------- //
// MAIN THREADS
// --------------------------------------------------------- //

#ifdef __linux__
void pinThreadToCore(pthread_t thread, int core_id) {
    cpu_set_t cpuset;
    CPU_ZERO(&cpuset);
    CPU_SET(core_id, &cpuset);
    pthread_setaffinity_np(thread, sizeof(cpu_set_t), &cpuset);
}
#else
void pinThreadToCore(pthread_t thread, int core_id) {}
#endif

int main() {
    try {
        std::cout << "[HFT] Initializing Ultra-Low Latency Execution Engine v3" << std::endl;
        
        MpmcQueue<TradeSignal> signalQueue(1024);
        ExecutionEngine execEngine;

        zmq::context_t context(1);
        
        // Signal Receiver (from Rust)
        zmq::socket_t subscriber(context, zmq::socket_type::sub);
        subscriber.connect("tcp://127.0.0.1:5555");
        subscriber.set(zmq::sockopt::subscribe, "");

        // Telemetry Publisher (to Rust -> Frontend)
        zmq::socket_t telemetryPub(context, zmq::socket_type::pub);
        telemetryPub.bind("tcp://127.0.0.1:5556");

        std::cout << "[HFT] Telemetry link active on port 5556" << std::endl;

        std::thread executionThread([&]() {
            pinThreadToCore(pthread_self(), 1); 
            while (true) {
                TradeSignal signal;
                if (signalQueue.pop(signal)) {
                    if (execEngine.preTradeRiskCheck(signal)) {
                        execEngine.executeOrder(signal);
                    }
                }
                std::this_thread::yield();
            }
        });

        std::thread zmqThread([&]() {
            pinThreadToCore(pthread_self(), 2); 
            std::cout << "[ZMQ] Execution loop warm..." << std::endl;
            uint64_t msgCount = 0;

            while (true) {
                zmq::message_t msg;
                auto res = subscriber.recv(msg, zmq::recv_flags::none);
                
                if (res) {
                    auto start = std::chrono::high_resolution_clock::now();
                    try {
                        TradeSignal sig = parseZeroMQPayload(msg);
                        signalQueue.push(sig);

                        auto end = std::chrono::high_resolution_clock::now();
                        auto diff = std::chrono::duration_cast<std::chrono::microseconds>(end - start).count();

                        // Throttled Telemetry update
                        if (++msgCount % 10 == 0) {
                            std::string stats = "telemetry|" + std::to_string(diff);
                            telemetryPub.send(zmq::buffer(stats), zmq::send_flags::none);
                        }

                    } catch (const std::exception& e) {
                        std::cerr << "[ZMQ Error] " << e.what() << std::endl;
                    }
                }
            }
        });

        executionThread.join();
        zmqThread.join();
    } catch (const std::exception& e) {
        std::cerr << "[HFT Fatal] " << e.what() << std::endl;
        return 1;
    }
    
    return 0;
}
