import * as React from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "./select";

function DropdownSelect({
  id,
  name,
  value,
  defaultValue = "",
  onValueChange,
  options = [],
  groups = [],
  placeholder,
  disabled,
  size = "default",
  className,
  contentClassName,
  "aria-label": ariaLabel,
}) {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const selectedValue = value ?? internalValue;
  const selectItems = React.useMemo(
    () => [
      ...options.map((option) => ({
        value: option.value,
        label: option.label,
      })),
      ...groups.flatMap((group) =>
        group.options.map((option) => ({
          value: option.value,
          label: option.label,
        })),
      ),
    ],
    [groups, options],
  );
  const handleValueChange = (next) => {
    const resolvedValue = next ?? "";
    if (value === undefined) setInternalValue(resolvedValue);
    onValueChange?.(resolvedValue);
  };
  return (
    <>
      <Select
        value={selectedValue}
        onValueChange={handleValueChange}
        disabled={disabled}
        items={selectItems}
      >
        <SelectTrigger
          id={id}
          aria-label={ariaLabel}
          size={size}
          className={className}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent align="start" className={contentClassName}>
          {options.map((option) => (
            <SelectItem
              key={option.key ?? option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </SelectItem>
          ))}
          {groups.map((group) => (
            <SelectGroup key={group.label}>
              <SelectLabel>{group.label}</SelectLabel>
              {group.options.map((option) => (
                <SelectItem
                  key={option.key ?? `${group.label}-${option.value}`}
                  value={option.value}
                  disabled={option.disabled}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      {name ? <input type="hidden" name={name} value={selectedValue} /> : null}
    </>
  );
}

export { DropdownSelect };
