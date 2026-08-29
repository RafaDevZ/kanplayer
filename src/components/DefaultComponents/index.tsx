import { autoUpdate, offset, shift } from "@floating-ui/dom";
import { useFloating } from "@floating-ui/react-dom";
import { Icon } from "@iconify/react";
import Tippy from "@tippyjs/react";
import React, { useEffect, useRef, useState, type ReactNode } from "react";
import "tippy.js/dist/tippy.css";
import { useAlert } from "../../utils/Utils";
import { Icons } from "../Icons";
import {
  ButtonBase,
  Detail,
  FileInputDropZone,
  FileInputIcon,
  FileInputText,
  Input,
  InputBox,
  InputFilterBody,
  Obrigatory,
  SliderBody,
  SliderBox,
  Tab,
  TabChildren,
  TabContainer,
  TabsBody,
  TabsBox,
  TextArea,
  TippyContextStyle,
  TitledDivContent,
  TitledInputBody,
  TitledInputContextBox,
  TitledTitle,
  HeaderLabelBody,
} from "./styles";

export * from "./styles";
const defaultContextColor = "var(--red-100)";
const infoIcon = <Icon icon="solar:info-circle-linear" />;

export interface ButtonProps extends React.ComponentPropsWithoutRef<
  typeof ButtonBase
> {
  loading?: boolean;
}

export function Button({
  children,
  disabled,
  loading = false,
  ...props
}: ButtonProps) {
  return (
    <ButtonBase
      {...props}
      disabled={disabled || loading}
      $disabled={disabled || loading}
    >
      {loading ? Icons.loadingIcon : children}
    </ButtonBase>
  );
}

function useContextTip(
  context?: string,
  color?: string,
  customIcon?: ReactNode,
) {
  const { refs, floatingStyles } = useFloating({
    placement: "top-end",
    strategy: "fixed",
    middleware: [offset(-10), shift()],
    whileElementsMounted: autoUpdate,
  });
  const tip = context ? (
    <>
      <TippyContextStyle />
      <Tippy
        content={context}
        delay={[500, 0]}
        theme="context-box"
        onShow={(instance) =>
          instance.popper.style.setProperty(
            "--context-box-color",
            color || defaultContextColor,
          )
        }
      >
        <TitledInputContextBox
          ref={refs.setFloating}
          style={floatingStyles}
          $color={color}
        >
          {customIcon || infoIcon}
        </TitledInputContextBox>
      </Tippy>
    </>
  ) : null;
  return { reference: refs.setReference, tip };
}

export interface ContextButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  context?: string;
  customIcon?: ReactNode;
  color?: string;
  obrigatory?: boolean;
  headerBtn?: boolean;
  cancel?: boolean;
  confirm?: boolean;
}
export function ContextButton({
  children,
  context,
  customIcon,
  color,
  obrigatory,
  headerBtn,
  cancel,
  confirm,
  disabled,
  className,
  style,
  ...rest
}: ContextButtonProps) {
  const { reference, tip } = useContextTip(context, color, customIcon);
  return (
    <div
      ref={reference}
      className={className}
      style={{ position: "relative", display: "flex", ...style }}
    >
      <Button
        {...rest}
        disabled={disabled}
        $obrigatory={obrigatory}
        $headerBtn={headerBtn}
        $disabled={disabled}
        $cancel={cancel}
        $confirm={confirm}
        style={{ width: "100%" }}
      >
        {children}
      </Button>
      {tip}
    </div>
  );
}

export interface TitledInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  title?: string;
  obrigatory?: boolean;
  context?: string;
  customIcon?: ReactNode;
  color?: string;
  blockWhen?: (value: number) => boolean;
  blockMessage?: string;
  detail?: string;
}
export const TitledInput = React.forwardRef<HTMLInputElement, TitledInputProps>(
  (
    {
      value,
      onChange,
      onBlur,
      placeholder,
      type,
      title,
      maxLength,
      obrigatory,
      disabled,
      className,
      defaultValue,
      context,
      min,
      max,
      customIcon,
      color,
      blockWhen,
      blockMessage,
      detail,
      ...rest
    },
    ref,
  ) => {
    const { setAlert } = useAlert();
    const isControlled = value !== undefined && value !== null;
    const normalizedValue =
      value === undefined || value === null || value === "undefined"
        ? ""
        : value;
    const { reference, tip } = useContextTip(context, color, customIcon);
    const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
      const parsed = Number(event.target.value);
      const parsedMax = max === undefined ? undefined : Number(max);
      if (
        type === "number" &&
        Number.isFinite(parsed) &&
        parsedMax !== undefined &&
        parsed > parsedMax
      )
        setAlert({
          type: "warning",
          message: `Valor máximo permitido: ${max}`,
        });
      if (blockWhen?.(parsed))
        setAlert({
          type: "warning",
          message: blockMessage ?? "Valor inválido",
        });
      onBlur?.(event);
    };
    return (
      <TitledInputBody ref={reference} className={className}>
        {obrigatory && <Obrigatory />}
        {title && <TitledTitle>{title}</TitledTitle>}
        <InputBox $detail={!!detail}>
          {detail && <Detail>{detail}</Detail>}
          <Input
            {...rest}
            ref={ref}
            onChange={onChange}
            onBlur={handleBlur}
            {...(isControlled ? { value: normalizedValue } : { defaultValue })}
            disabled={disabled}
            placeholder={placeholder}
            type={type}
            maxLength={maxLength}
            min={min}
            max={max}
          />
        </InputBox>
        {tip}
      </TitledInputBody>
    );
  },
);

export interface TitledFileInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "value"
> {
  title?: string;
  obrigatory?: boolean;
  context?: string;
  customIcon?: ReactNode;
  color?: string;
  text?: string;
  onImport?: (files: File[]) => void;
}

export const TitledFileInput = React.forwardRef<
  HTMLInputElement,
  TitledFileInputProps
>(
  (
    {
      title,
      obrigatory,
      context,
      customIcon,
      color,
      text = "Clique ou arraste um arquivo aqui",
      className,
      disabled,
      onChange,
      onImport,
      ...rest
    },
    ref,
  ) => {
    const [isDragging, setIsDragging] = useState(false);
    const [fileName, setFileName] = useState("");
    const { reference, tip } = useContextTip(context, color, customIcon);
    const importFiles = (files: File[]) => {
      if (files.length === 0) return;

      setFileName(files.map((file) => file.name).join(", "));
      onImport?.(files);
    };

    return (
      <TitledInputBody ref={reference} className={className}>
        {obrigatory && <Obrigatory />}
        {title && <TitledTitle>{title}</TitledTitle>}

        <FileInputDropZone
          $disabled={disabled}
          $dragging={isDragging}
          onDragEnter={(event) => {
            event.preventDefault();
            if (!disabled) setIsDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (event.currentTarget === event.target) setIsDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            if (!disabled) importFiles(Array.from(event.dataTransfer.files));
          }}
        >
          <input
            {...rest}
            ref={ref}
            type="file"
            disabled={disabled}
            onChange={(event) => {
              importFiles(Array.from(event.currentTarget.files ?? []));
              onChange?.(event);
            }}
          />
          <FileInputIcon>
            <Icon icon="bi:folder" />
          </FileInputIcon>
          <FileInputText>{fileName || text}</FileInputText>
        </FileInputDropZone>

        {tip}
      </TitledInputBody>
    );
  },
);

export interface TitledDivProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  title?: string;
  obrigatory?: boolean;
  disabled?: boolean;
  context?: string;
  customIcon?: ReactNode;
  color?: string;
}
export const TitledDiv = React.forwardRef<HTMLDivElement, TitledDivProps>(
  (
    {
      children,
      title,
      obrigatory,
      disabled,
      className,
      context,
      customIcon,
      color,
      ...rest
    },
    ref,
  ) => {
    const { reference, tip } = useContextTip(context, color, customIcon);
    return (
      <TitledInputBody ref={reference} className={className}>
        {obrigatory && <Obrigatory />}
        {title && <TitledTitle>{title}</TitledTitle>}
        <TitledDivContent {...rest} ref={ref} $disabled={disabled}>
          {children}
        </TitledDivContent>
        {tip}
      </TitledInputBody>
    );
  },
);
export const TtiledDiv = TitledDiv;

export interface TitledTextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  title?: string;
  obrigatory?: boolean;
  context?: string;
  customIcon?: ReactNode;
  color?: string;
}
export const TitledTextArea = React.forwardRef<
  HTMLTextAreaElement,
  TitledTextAreaProps
>(
  (
    {
      value,
      onChange,
      title,
      obrigatory,
      className,
      context,
      customIcon,
      color,
      rows = 4,
      onInput,
      ...rest
    },
    forwardedRef,
  ) => {
    const innerRef = useRef<HTMLTextAreaElement>(null);
    const { reference, tip } = useContextTip(context, color, customIcon);
    const resize = (textarea: HTMLTextAreaElement) => {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 400)}px`;
    };
    useEffect(() => {
      if (innerRef.current) resize(innerRef.current);
    }, [value]);
    return (
      <TitledInputBody
        ref={reference}
        className={`${className || ""} textarea`}
      >
        {obrigatory && <Obrigatory />}
        {title && <TitledTitle>{title}</TitledTitle>}
        <TextArea
          {...rest}
          value={value === undefined || value === null ? "" : value}
          rows={rows}
          ref={(node) => {
            innerRef.current = node;
            if (typeof forwardedRef === "function") forwardedRef(node);
            else if (forwardedRef) forwardedRef.current = node;
          }}
          onChange={onChange}
          onInput={(event) => {
            resize(event.currentTarget);
            onInput?.(event);
          }}
        />
        {tip}
      </TitledInputBody>
    );
  },
);

export interface SliderProps {
  active: boolean | null;
  setActive: (value: boolean) => void;
  obrigatory?: boolean;
  classname?: string;
  noDisable?: boolean;
  colors?: string[];
}
export function Slider({ active, setActive, classname }: SliderProps) {
  return (
    <SliderBody
      className={`${classname || ""} slider`}
      onClick={() => setActive(!active)}
    >
      <SliderBox className="sliderball" $active={active} />
    </SliderBody>
  );
}
export interface TabProps {
  icon: ReactNode;
  child: ReactNode;
  block?: boolean;
  action?: () => void;
  identifier?: string;
}
export interface TabsProps {
  tabs: TabProps[];
  onActiveTab?: (index: number) => void;
  tabIndex?: number;
  tabIdentifier?: string;
}
export function Tabs({
  tabs,
  onActiveTab,
  tabIndex,
  tabIdentifier,
}: TabsProps) {
  const [activeTab, setActiveTab] = useState(tabIndex ?? 0);
  useEffect(() => {
    if (tabIndex !== undefined && tabIndex !== activeTab)
      setActiveTab(tabIndex);
  }, [tabIndex, activeTab]);
  useEffect(() => {
    const index = tabs.findIndex((tab) => tab.identifier === tabIdentifier);
    if (tabIdentifier && index !== -1 && index !== activeTab)
      setActiveTab(index);
  }, [tabIdentifier, tabs, activeTab]);
  return (
    <TabsBody>
      <TabsBox>
        {tabs.map((tab, index) => (
          <Tab
            key={index}
            $active={activeTab === index}
            $block={!!tab.block}
            onClick={() => {
              if (tab.block || activeTab === index) return;
              setActiveTab(index);
              onActiveTab?.(index);
              tab.action?.();
            }}
          >
            {tab.icon}
          </Tab>
        ))}
      </TabsBox>
      <TabContainer>
        {tabs.map((tab, index) => (
          <TabChildren key={index} $active={activeTab === index}>
            {tab.child}
          </TabChildren>
        ))}
      </TabContainer>
    </TabsBody>
  );
}
export interface InputFilterProps extends React.InputHTMLAttributes<HTMLInputElement> {
  value?: string;
  setValue?: (value: string) => void;
}
export function InputFilter({ value, setValue, ...props }: InputFilterProps) {
  return (
    <InputFilterBody>
      <Input
        {...props}
        style={{ border: 0, ...props.style }}
        value={value}
        onChange={(event) => setValue?.(event.currentTarget.value)}
      />
    </InputFilterBody>
  );
}
export function HeaderLabel({ children }: { children?: ReactNode }) {
  return <HeaderLabelBody>{children}</HeaderLabelBody>;
}
