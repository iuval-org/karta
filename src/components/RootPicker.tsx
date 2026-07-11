import { useGooglePicker } from '../hooks/useGooglePicker';

interface RootPickerProps {
  onFolderSelected: (folderId: string, folderName: string) => void;
}

export default function RootPicker({ onFolderSelected }: RootPickerProps) {
  const { showPicker, error } = useGooglePicker(onFolderSelected);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#1E40AF] px-4">
      <div className="flex flex-col items-center gap-6 motion-safe:animate-fade-in-up">
        <DriveFolderIcon />
        <h1 className="text-3xl font-bold text-white tracking-tight text-center">
          Seleccioná tu carpeta de trabajo
        </h1>
        <p className="text-blue-200 text-base text-center max-w-md">
          Elegí la carpeta de Google Drive donde se guardarán tus mapas
          mentales y recursos.
        </p>

        <button
          onClick={showPicker}
          className="flex items-center justify-center gap-3 w-full max-w-xs px-6 py-3 bg-white rounded-xl text-gray-900 font-medium text-sm hover:shadow-lg hover:bg-gray-50 transition-all duration-200 active:scale-[0.97] cursor-pointer motion-safe:transition-[transform,box-shadow,background-color]"
        >
          <DriveIcon />
          Elegir carpeta en Google Drive
        </button>

        {error && (
          <div className="flex flex-col items-center gap-2 max-w-sm">
            <p className="text-red-300 text-sm text-center">{error}</p>
            <button
              onClick={showPicker}
              className="text-blue-200 text-sm underline hover:text-blue-100 transition-colors cursor-pointer"
            >
              Reintentar
            </button>
          </div>
        )}
      </div>

      <footer className="fixed bottom-6 text-blue-300 text-xs text-center">
        <p>Necesitás una cuenta de Google con Google Drive activo</p>
      </footer>
    </div>
  );
}

function DriveFolderIcon() {
  return (
    <svg
      viewBox="0 0 48 48"
      className="w-20 h-20"
      aria-hidden="true"
    >
      <path
        fill="#8C9EFF"
        d="M4 12c0-2.21 1.79-4 4-4h12l4 4h12c2.21 0 4 1.79 4 4v20c0 2.21-1.79 4-4 4H8c-2.21 0-4-1.79-4-4V12z"
      />
      <path
        fill="#536DFE"
        d="M4 14c0-2.21 1.79-4 4-4h12l4 4h12c2.21 0 4 1.79 4 4v18c0 2.21-1.79 4-4 4H8c-2.21 0-4-1.79-4-4V14z"
      />
      <path
        fill="#fff"
        d="M24 22l-4-6h8l-4 6zm4 2l-4 6-4-6h8zm-8 0l-4 6h8l-4-6z"
        opacity="0.3"
      />
    </svg>
  );
}

function DriveIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M12.5 2L7.5 11l5 9h-5L2.5 11l5-9h5z"
      />
      <path
        fill="#34A853"
        d="M17.5 2l5 9-5 9h-5l5-9-5-9h5z"
      />
      <path
        fill="#EA4335"
        d="M7.5 20h5l-2.5-4.5L7.5 20z"
      />
    </svg>
  );
}
