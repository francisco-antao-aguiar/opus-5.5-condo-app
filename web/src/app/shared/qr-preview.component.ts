import { Component, effect, inject, input, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { AssetDto } from '@condo/shared';
import { ToastService } from '../core/toast.service';
import { copyText } from './clipboard';
import { qrFileName } from './qr';
import { downloadSvg, qrSvg } from './qr-svg';

/** QR of an asset's printed link, with Download SVG / Copy link / Print label. */
@Component({
  selector: 'app-qr-preview',
  imports: [RouterLink],
  template: `
    <div class="qr-preview">
      <div class="qr-box" [innerHTML]="svgHtml()" role="img" [attr.aria-label]="'QR code for ' + asset().name"></div>
      <div class="qr-side">
        <p class="small muted">Scanning it opens <code class="qr-url">{{ asset().qrUrl }}</code></p>
        <div class="row gap wrap">
          <button type="button" class="btn btn-sm" [disabled]="!svg()" (click)="download()">⬇ Download SVG</button>
          <button type="button" class="btn btn-sm" (click)="copy()">⧉ Copy link</button>
          <a class="btn btn-sm" [routerLink]="['/buildings', asset().buildingId, 'assets', 'labels']" [queryParams]="{ ids: asset().id }" [state]="{ ids: [asset().id] }">🖨 Print label</a>
        </div>
      </div>
    </div>
  `,
})
export class QrPreviewComponent {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly toast = inject(ToastService);

  readonly asset = input.required<AssetDto>();

  protected readonly svg = signal('');
  protected readonly svgHtml = signal<SafeHtml>('');

  constructor() {
    effect(() => {
      const url = this.asset().qrUrl;
      qrSvg(url).then(
        (svg) => {
          this.svg.set(svg);
          // Generated locally by the qrcode library from our own URL: safe to render as-is.
          this.svgHtml.set(this.sanitizer.bypassSecurityTrustHtml(svg));
        },
        () => this.toast.info("Couldn't draw the QR code"),
      );
    });
  }

  protected download(): void {
    downloadSvg(this.svg(), qrFileName(this.asset().name));
  }

  protected async copy(): Promise<void> {
    if (await copyText(this.asset().qrUrl)) this.toast.success('Link copied');
    else this.toast.info("Couldn't copy automatically", this.asset().qrUrl);
  }
}
