import { t } from '../locales/runtime';
import { useRef, useState, type ChangeEvent } from 'react';
import { Image as ImageIcon, ImageOff, Loader2, RotateCcw, Upload } from 'lucide-react';
import { MAX_ATTENDANCE_IMAGE_BYTES } from '../../../shared/attendance';
export type CapturedPhoto = {
    photo: string;
    capturedAt: string;
    perceptualHash?: string;
};
async function calculateDHash(dataUrl: string) {
    const image = new Image();
    image.src = dataUrl;
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('IMAGE_DECODE_FAILED')); });
    const canvas = document.createElement('canvas');
    canvas.width = 9;
    canvas.height = 8;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context)
        return undefined;
    context.drawImage(image, 0, 0, 9, 8);
    const pixels = context.getImageData(0, 0, 9, 8).data;
    let bits = '';
    for (let row = 0; row < 8; row += 1)
        for (let column = 0; column < 8; column += 1) {
            const left = ((row * 9) + column) * 4;
            const right = ((row * 9) + column + 1) * 4;
            const leftGray = pixels[left] * 0.299 + pixels[left + 1] * 0.587 + pixels[left + 2] * 0.114;
            const rightGray = pixels[right] * 0.299 + pixels[right + 1] * 0.587 + pixels[right + 2] * 0.114;
            bits += leftGray > rightGray ? '1' : '0';
        }
    let hash = '';
    for (let index = 0; index < bits.length; index += 4)
        hash += Number.parseInt(bits.slice(index, index + 4), 2).toString(16);
    return hash;
}
export function CameraCapture({ onCapture, onCancel, purpose = 'attendance' }: {
    onCapture: (capture: CapturedPhoto) => void | Promise<void>;
    onCancel: () => void; purpose?: 'attendance' | 'incident';
}) {
    const fileRef = useRef<HTMLInputElement>(null);
    const [error, setError] = useState('');
    const [captured, setCaptured] = useState<CapturedPhoto>();
    const [uploading, setUploading] = useState(false);
    function chooseImage(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (!file)
            return;
        if (!file.type.startsWith('image/')) {
            setError('Please choose an image file.');
            return;
        }
        if (file.size > MAX_ATTENDANCE_IMAGE_BYTES) {
            setError('Image must be smaller than 8 MB.');
            return;
        }
        const reader = new FileReader();
        reader.onload = async () => {
            const photo = String(reader.result);
            try {
                setCaptured({ photo, capturedAt: new Date().toISOString(), perceptualHash: await calculateDHash(photo) });
                setError('');
            }
            catch {
                setError('Image could not be decoded. Please choose another image.');
            }
        };
        reader.onerror = () => setError('Image could not be read. Please choose another image.');
        reader.readAsDataURL(file);
    }
    async function savePhoto() {
        if (!captured || uploading)
            return;
        setUploading(true);
        try {
            await onCapture(captured);
        }
        catch {
            setError('Image could not be saved. Please try again.');
        }
        finally {
            setUploading(false);
        }
    }
    function chooseAnother() {
        setCaptured(undefined);
        setError('');
        if (fileRef.current)
            fileRef.current.value = '';
    }
    if (captured)
        return <div className="camera-card"><img src={captured.photo} className="capture-preview" alt={t(purpose === 'incident' ? 'Select an incident image' : 'Attendance upload preview')}/>{error && <div className="camera-error"><strong>{t(error)}</strong></div>}<div className="camera-actions"><button className="button secondary" disabled={uploading} onClick={chooseAnother}><RotateCcw size={17}/>{t(" Choose another")}</button><button className="button primary" disabled={uploading} onClick={() => void savePhoto()}>{uploading ? <><Loader2 className="spin" size={17}/>{t(" Uploading\u2026")}</> : <><Upload size={17}/>{t(" Upload image")}</>}</button></div></div>;
    return <div className="camera-card"><div className="image-upload-picker"><ImageIcon size={34}/><strong>{t(purpose === 'incident' ? 'Select an incident image' : 'Upload attendance image')}</strong><span>{t("Select one image from your device. Location and camera access are not needed.")}</span><button className="button primary" type="button" onClick={() => fileRef.current?.click()}><Upload size={17}/>{t(" Choose image")}</button><input ref={fileRef} hidden type="file" accept="image/*" onChange={chooseImage}/></div>{error && <div className="camera-error"><strong>{t(error)}</strong></div>}<div className="camera-actions"><button className="button secondary" onClick={onCancel}><ImageOff size={16}/>{t(" Cancel")}</button></div></div>;
}
