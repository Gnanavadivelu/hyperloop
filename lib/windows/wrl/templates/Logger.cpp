<%- renderTemplate('jsc/templates/doc.ejs') %>
#include "Logger.h"
#include <ppltasks.h>
using namespace concurrency;

static Windows::Storage::StorageFile ^logFile = nullptr;
static bool logFileGenerating = false;
static Platform::Array<Platform::String ^> ^logQueue = ref new Platform::Array<Platform::String ^>(100);
static int logIndex = 0;

void Logger::log(Platform::String ^string) {
	string += "\r\n";
	OutputDebugString(std::wstring(string->Data()).c_str());
	if (logFileGenerating) {
		logQueue[logIndex++] = string;
	}
	else if (logFile == nullptr) {
		logFileGenerating = true;
		logQueue[logIndex++] = string;
		OutputDebugString(L"Creating log file...\r\n");
		auto logFolder = Windows::Storage::ApplicationData::Current->LocalFolder;
		auto task = create_task(logFolder->CreateFileAsync("log.txt", Windows::Storage::CreationCollisionOption::ReplaceExisting));
		task.then([](Windows::Storage::StorageFile ^file) {
			OutputDebugString(std::wstring(("Created log file at " + file->Path + "\r\n")->Data()).c_str());
			logFile = file;
			for (auto i = 0; i < logIndex; i++) {
				Windows::Storage::FileIO::AppendTextAsync(logFile, logQueue[i]);
			}
			logIndex = 0;
			logQueue = nullptr;
			logFileGenerating = false;
		});
	}
	else {
		Windows::Storage::FileIO::AppendTextAsync(logFile, string);
	}
}