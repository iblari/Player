"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import Avatar from "@/components/Avatar";
import { track } from "@/lib/track";

/**
 * In-person sharing: a big QR code for a profile. The other person points their phone camera
 * at it and lands on the profile with a Follow button, no texting needed.
 */
export default function ProfileQR({
  userId,
  name,
  avatar,
  onShareLink,
  onClose,
}: {
  userId: string;
  name: string;
  avatar: string | null;
  onShareLink: () => void;
  onClose: () => void;
}) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    const url = `${window.location.origin}/p/${userId}?via=qr`;
    // High error correction so the logo in the middle doesn't stop it scanning.
    QRCode.toString(url, { type: "svg", errorCorrectionLevel: "H", margin: 0, color: { dark: "#111111", light: "#ffffff" } }).then(setSvg);
    track("profile_qr");
  }, [userId]);

  return (
    <div className="sheet-wrap" onClick={onClose} role="dialog" aria-modal="true" aria-label="Your Players Club code">
      <div className="sheet qr-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="qr-card">
          <div className="qr-who">
            <Avatar id={userId} name={name} size={48} src={avatar} />
            <b>{name}</b>
          </div>
          <div className="qr-code">
            {svg ? <span className="qr-svg" dangerouslySetInnerHTML={{ __html: svg }} /> : <span className="qr-svg qr-wait" />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mark.svg" alt="" className="qr-logo" />
          </div>
          <span className="qr-hint">Scan with your phone camera to follow me on Players Club</span>
        </div>
        <button className="btn btn-block" onClick={onShareLink}>
          Share link instead
        </button>
        <button className="btn btn-ghost btn-block" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
