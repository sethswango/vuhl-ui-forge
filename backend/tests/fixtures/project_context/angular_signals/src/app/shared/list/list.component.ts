import { Component, Input, signal, computed } from "@angular/core";

@Component({
  selector: "app-list",
  standalone: true,
  templateUrl: "./list.component.html"
})
export class ListComponent {
  @Input() heading: string = "Items";
  items = signal<string[]>([]);
  count = computed(() => this.items().length);
}
