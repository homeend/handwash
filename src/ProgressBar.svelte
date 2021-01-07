<script>
    export let progress;
    export let total = 20;
    if(progress < 0) progress = 0;
    if(progress >= total) progress = total;
    $: percent = (progress / total) * 100;
</script>

<style>
    .progress-container {
        margin: 20px, 0;
        border: solid rgb(194, 194, 194) 1px;
    }
    .progress-bar {
        height: 30px;
        background-color: rgb(77, 199, 55);
    }
</style>

<div bp="grid">
    <div class="progress-container" bp="offset-5@md 4@md 12@sm">
        <div class="progress-bar" style="width: {percent}%">
            <span class="sr-only">{percent}</span>
        </div>
    </div>
</div>