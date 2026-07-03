import React, { useEffect, useState } from "react";
import { MessageToastProps } from "../types";

const MessageToast: React.FC<MessageToastProps> = ({ type, text }) => {
  const [isVisible, setIsVisible] = useState<boolean>(true);

  useEffect(() => {
    setIsVisible(true);
    const timer = setTimeout(() => {
      setIsVisible(false);
    }, 3000);

    return () => {
      clearTimeout(timer);
    };
  }, [text]);

  const getBackgroundColor = (): string => {
    switch (type) {
      case "success":
        return "bg-green-500";
      case "error":
        return "bg-red-500";
      case "warning":
        return "bg-yellow-500";
      case "info":
      default:
        return "bg-blue-500";
    }
  };

  if (!isVisible) return null;

  return (
    <div
      className={`fixed bottom-5 left-1/2 -translate-x-1/2 ${getBackgroundColor()} text-white px-4 py-2 rounded-md shadow-md z-50 transition-opacity duration-300 ease-in-out`}
    >
      {text}
    </div>
  );
};

export default MessageToast;
