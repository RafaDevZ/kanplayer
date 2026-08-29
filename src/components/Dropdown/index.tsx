import { autoUpdate, offset, shift, size } from "@floating-ui/dom";
import { useFloating } from "@floating-ui/react-dom";
import { Icon } from "@iconify/react";
import { useEffect, useState, type ReactNode } from "react";
import {
  DropdownAnimatedContainer,
  DropdownArrow,
  DropdownBody,
  DropdownContainer,
  DropdownTitle,
  DropdownTitleNode,
} from "./styles";

export interface DropdownProps {
  children?: ReactNode;
  title?: ReactNode;
  width?: string;
  maxHeight?: string;
  isOpen: boolean;
  onClick?: () => void;
  disabled?: boolean;
  zIndex?: number;
}

export default function Dropdown({
  children,
  title,
  width,
  maxHeight,
  isOpen,
  onClick,
  disabled,
  zIndex,
}: DropdownProps) {
  const [containerVisible, setContainerVisible] = useState(isOpen);
  const { refs, floatingStyles } = useFloating({
    open: isOpen,
    placement: "bottom-end",
    strategy: "fixed",
    middleware: [
      offset(0),
      shift(),
      size({
        apply({ rects, elements }) {
          Object.assign(elements.floating.style, {
            width: `${rects.reference.width}px`,
          });
        },
      }),
    ],
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    if (isOpen) setContainerVisible(true);
  }, [isOpen]);

  return (
    <DropdownBody
      ref={refs.setReference}
      $disabled={disabled}
      $isOpen={isOpen}
      $width={width}
      $maxHeight={maxHeight}
      onClick={() => !disabled && onClick?.()}
    >
      <DropdownTitle>
        <DropdownTitleNode>{title}</DropdownTitleNode>
      </DropdownTitle>
      {containerVisible && (
        <DropdownContainer
          ref={refs.setFloating}
          style={{ ...floatingStyles, zIndex: zIndex ?? 10 }}
          onClick={(event) => event.stopPropagation()}
        >
          <DropdownAnimatedContainer
            $isOpen={isOpen}
            onAnimationEnd={() => {
              if (!isOpen) setContainerVisible(false);
            }}
          >
            {children}
          </DropdownAnimatedContainer>
        </DropdownContainer>
      )}
      <DropdownArrow $isOpen={isOpen}>
        <Icon icon="weui:arrow-filled" />
      </DropdownArrow>
    </DropdownBody>
  );
}
