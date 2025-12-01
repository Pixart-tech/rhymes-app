import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider'; // Assuming you have a Slider component
import { getCroppedImg } from './cropImage';


interface ImageCropperProps {
  imageSrc: string | null;
  onCropComplete: (croppedImage: Blob) => void;
  onClose: () => void;
}

const ImageCropperDialog: React.FC<ImageCropperProps> = ({ imageSrc, onCropComplete, onClose }) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const onCropChange = useCallback((crop: any) => {
    setCrop(crop);
  }, []);

  const onZoomChange = useCallback((zoom: any) => {
    setZoom(zoom);
  }, []);

  const onCropFull = useCallback((croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleCrop = async () => {
    if (imageSrc && croppedAreaPixels) {
      const croppedImage = await getCroppedImg(imageSrc, croppedAreaPixels);
      onCropComplete(croppedImage);
      onClose();
    }
  };

  return (
    <Dialog open={!!imageSrc} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg bg-white">
        <DialogHeader>
          <DialogTitle>Adjust Image</DialogTitle>
          <DialogDescription>
            Adjust the image in the box.
          </DialogDescription>
        </DialogHeader>
        <div className="relative h-80 w-full bg-gray-200">
          {imageSrc && (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="rect"
              onCropChange={onCropChange}
              onZoomChange={onZoomChange}
              onCropComplete={onCropFull}
              minZoom={0.1}
              maxZoom={5}
              showGrid={true}
              restrictPosition={false}
            />
          )}
        </div>
        <div className="mt-4">
          <label className="mb-2 block text-sm font-medium">Zoom</label>
          <Slider
            min={0.1}
            max={5}
            step={0.1}
            value={[zoom]}
            onValueChange={(value: any[]) => onZoomChange(value[0])}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleCrop}>Save Image</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImageCropperDialog;