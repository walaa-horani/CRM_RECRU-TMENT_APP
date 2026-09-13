import * as React from "react";
import { Select as SelectPrimitive } from "@base-ui/react/select";
declare const Select: typeof SelectPrimitive.Root;
declare function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props): React.JSX.Element;
declare function SelectValue({ className, ...props }: SelectPrimitive.Value.Props): React.JSX.Element;
declare function SelectTrigger({ className, size, children, ...props }: SelectPrimitive.Trigger.Props & {
    size?: "sm" | "default";
}): React.JSX.Element;
declare function SelectContent({ className, children, side, sideOffset, align, alignOffset, alignItemWithTrigger, ...props }: SelectPrimitive.Popup.Props & Pick<SelectPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset" | "alignItemWithTrigger">): React.JSX.Element;
declare function SelectLabel({ className, ...props }: SelectPrimitive.GroupLabel.Props): React.JSX.Element;
declare function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props): React.JSX.Element;
declare function SelectSeparator({ className, ...props }: SelectPrimitive.Separator.Props): React.JSX.Element;
declare function SelectScrollUpButton({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>): React.JSX.Element;
declare function SelectScrollDownButton({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>): React.JSX.Element;
export { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectScrollDownButton, SelectScrollUpButton, SelectSeparator, SelectTrigger, SelectValue, };
