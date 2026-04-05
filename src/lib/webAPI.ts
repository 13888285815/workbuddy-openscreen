
export const initWebAPI = () => {
	if (window.electronAPI && (window as any).process?.type === 'renderer') return;

	const dbName = "OpenScreenWebDB";
	const dbVersion = 1;
	
	const dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open(dbName, dbVersion);
		request.onupgradeneeded = (event: any) => {
			const db = event.target.result;
			if (!db.objectStoreNames.contains("files")) {
				db.createObjectStore("files");
			}
			if (!db.objectStoreNames.contains("sessions")) {
				db.createObjectStore("sessions", { keyPath: "createdAt" });
			}
		};
		request.onsuccess = (event: any) => resolve(event.target.result);
		request.onerror = (event: any) => reject(event.target.error);
	});

	let currentSession: any = null;
	let currentVideoPath: string | null = null;

	(window as any).electronAPI = {
		getSources: async () => {
			return [{
				id: "web-viewport",
				name: "浏览器窗口",
				display_id: "0",
				thumbnail: null,
				appIcon: null
			}];
		},
		switchToEditor: async () => {
			window.location.hash = "#/editor";
		},
		openSourceSelector: async () => {},
		selectSource: async (source: any) => source,
		getSelectedSource: async () => ({
			id: "web-viewport",
			name: "浏览器窗口",
			display_id: "0",
			thumbnail: null,
			appIcon: null
		}),
		requestCameraAccess: async () => {
			try {
				const stream = await navigator.mediaDevices.getUserMedia({ video: true });
				stream.getTracks().forEach(t => t.stop());
				return { success: true, granted: true, status: "granted" };
			} catch (e) {
				return { success: false, granted: false, status: "denied" };
			}
		},
		storeRecordedVideo: async (videoData: ArrayBuffer, fileName: string) => {
			const db = await dbPromise;
			const blob = new Blob([videoData], { type: "video/webm" });
			const tx = db.transaction("files", "readwrite");
			tx.objectStore("files").put(blob, fileName);
			const path = URL.createObjectURL(blob);
			return { success: true, path };
		},
		storeRecordedSession: async (payload: any) => {
			const db = await dbPromise;
			const screenBlob = new Blob([payload.screen.videoData], { type: "video/webm" });
			const screenUrl = URL.createObjectURL(screenBlob);
			
			const tx = db.transaction(["files", "sessions"], "readwrite");
			tx.objectStore("files").put(screenBlob, payload.screen.fileName);
			
			let webcamVideoPath;
			if (payload.webcam) {
				const webcamBlob = new Blob([payload.webcam.videoData], { type: "video/webm" });
				webcamVideoPath = URL.createObjectURL(webcamBlob);
				tx.objectStore("files").put(webcamBlob, payload.webcam.fileName);
			}

			const session = {
				createdAt: payload.createdAt || Date.now(),
				screenVideoPath: screenUrl,
				webcamVideoPath,
				fileName: payload.screen.fileName
			};
			
			tx.objectStore("sessions").put(session);
			currentSession = session;
			
			return { success: true, session };
		},
		getRecordedVideoPath: async () => ({ success: true, path: currentVideoPath || "" }),
		getAssetBasePath: async () => "",
		setRecordingState: async () => {},
		getCursorTelemetry: async () => ({ success: true, samples: [] }),
		onStopRecordingFromTray: () => () => {},
		openExternalUrl: async (url: string) => {
			window.open(url, '_blank');
			return { success: true };
		},
		saveExportedVideo: async (videoData: ArrayBuffer, fileName: string) => {
			const blob = new Blob([videoData], { type: "video/mp4" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = fileName;
			a.click();
			URL.revokeObjectURL(url);
			return { success: true };
		},
		openVideoFilePicker: async () => ({ success: false, canceled: true }),
		setCurrentVideoPath: async (path: string) => {
			currentVideoPath = path;
			return { success: true };
		},
		setCurrentRecordingSession: async (session: any) => {
			currentSession = session;
			return { success: true, session };
		},
		getCurrentVideoPath: async () => ({ success: true, path: currentVideoPath || "" }),
		getCurrentRecordingSession: async () => ({ success: true, session: currentSession }),
		clearCurrentVideoPath: async () => {
			currentVideoPath = null;
			return { success: true };
		},
		saveProjectFile: async (data: any, name: string) => {
			const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = name || "project.json";
			a.click();
			return { success: true };
		},
		loadProjectFile: async () => ({ success: false, canceled: true }),
		loadCurrentProjectFile: async () => ({ success: false }),
		onMenuLoadProject: () => () => {},
		onMenuSaveProject: () => () => {},
		onMenuSaveProjectAs: () => () => {},
		getPlatform: async () => "web",
		setLocale: async () => {},
		setHasUnsavedChanges: () => {},
		onRequestSaveBeforeClose: () => () => {},
		readBinaryFile: async (path: string) => {
			if (path.startsWith("blob:")) {
				return await (await fetch(path)).arrayBuffer();
			}
			const db = await dbPromise;
			return new Promise((resolve, reject) => {
				const req = db.transaction("files", "readonly").objectStore("files").get(path);
				req.onsuccess = async () => {
					if (req.result instanceof Blob) {
						resolve(await req.result.arrayBuffer());
					} else {
						reject(new Error("File not found"));
					}
				};
				req.onerror = () => reject(req.error);
			});
		}
	};
};
